package za.co.welovemining.asicmanager.data.remote.firmware

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import za.co.welovemining.asicmanager.data.model.BoardStat
import za.co.welovemining.asicmanager.data.model.CoolingType
import za.co.welovemining.asicmanager.data.model.HydroStat
import za.co.welovemining.asicmanager.data.model.Miner
import za.co.welovemining.asicmanager.data.model.MinerState
import za.co.welovemining.asicmanager.data.model.MinerStats
import za.co.welovemining.asicmanager.data.model.PoolStat
import za.co.welovemining.asicmanager.data.remote.cgminer.CgminerSocketClient

/**
 * One adapter for every miner that speaks the cgminer/bmminer socket API
 * (Braiins OS+, Avalon/Canaan, Bitmain stock). Rather than guess the firmware
 * and pick a narrow parser, it queries all the relevant commands and merges
 * whatever each device actually exposes:
 *
 *  - `summary`      → hashrate, uptime
 *  - `version`      → model + firmware string
 *  - `temps`/`fans`/`tunerstatus` → Braiins board temps, fans, power
 *  - `stats`        → Avalon "MM ID" string (temps/fans/power/coolant) and
 *                     Bitmain stock chip/pcb temps + fans
 *  - `pools`        → pool status
 *
 * This makes stats robust even when discovery mis-labels the firmware.
 */
class CgminerClient(
    private val socket: CgminerSocketClient,
) : MinerApiClient {

    private fun port(miner: Miner) = miner.port ?: CgminerSocketClient.DEFAULT_PORT

    override suspend fun fetchStats(miner: Miner): Result<MinerStats> {
        val host = miner.lanHost
        val p = port(miner)

        val summary = socket.command(host, p, "summary").getOrElse {
            return Result.success(MinerStats.offline(miner.id, it.message))
        }
        val s = (summary as? JsonObject)?.list("SUMMARY")?.firstOrNull() as? JsonObject
            ?: return Result.success(MinerStats.offline(miner.id, "no SUMMARY"))

        val ghs5s = s.numAny("GHS 5s", "MHS 5s")?.let { normaliseGhs(s, it) } ?: 0.0
        val ghsAv = s.numAny("GHS av", "MHS av")?.let { normaliseGhs(s, it) } ?: ghs5s
        val uptime = s.num("Elapsed")?.toLong() ?: 0

        // version → model + firmware label
        val vObj = socket.command(host, p, "version").getOrNull()
            ?.let { (it as? JsonObject)?.list("VERSION")?.firstOrNull() } as? JsonObject
        val deviceModel = vObj.strAny("Type", "Miner", "Model").orEmpty()
        val firmwareVersion = firmwareLabel(vObj, deviceModel)

        // Braiins-style structured commands
        val temps = socket.command(host, p, "temps").getOrNull()
            ?.let { (it as? JsonObject)?.list("TEMPS") }.orEmpty().mapNotNull { it as? JsonObject }
        val fansResp = socket.command(host, p, "fans").getOrNull()
            ?.let { (it as? JsonObject)?.list("FANS") }.orEmpty().mapNotNull { it as? JsonObject }
        val tuner = socket.command(host, p, "tunerstatus").getOrNull()
            ?.let { (it as? JsonObject)?.list("TUNERSTATUS").orEmpty().firstOrNull() } as? JsonObject

        // stats → Avalon MM string + Bitmain fields
        val statsObjs = socket.command(host, p, "stats").getOrNull()
            ?.let { (it as? JsonObject)?.list("STATS") }.orEmpty().mapNotNull { it as? JsonObject }
        val mm = statsObjs.firstNotNullOfOrNull { it.mmString().ifBlank { null } }.orEmpty()
        val bitmainStats = statsObjs.firstOrNull { it["temp1"] != null || it["temp2_1"] != null || it["temp_max"] != null }

        val boards = buildBoards(temps, mm, bitmainStats)
        val fanRpms = buildFans(fansResp, mm, bitmainStats)
        val power = tuner.numAny("ApproximateMinerPowerConsumption", "PowerConsumption", "MinerPowerConsumption", "PowerLimit")
            ?: avalonPower(mm)
            ?: 0.0
        val maxTemp = boards.maxOfOrNull { maxOf(it.chipTempC, it.boardTempC) }
            ?: mm.token("TMax")?.toDoubleOrNull()
            ?: bitmainStats.numAny("temp_max") ?: 0.0

        val hashrate = ghs5s / 1000.0
        val pools = fetchPools(miner).getOrDefault(emptyList())

        return Result.success(
            MinerStats(
                minerId = miner.id,
                state = if (hashrate > 0) MinerState.ONLINE else MinerState.WARNING,
                hashrateThs = hashrate,
                avgHashrateThs = ghsAv / 1000.0,
                powerW = power,
                efficiencyJTh = if (hashrate > 0) power / hashrate else 0.0,
                maxTempC = maxTemp,
                boards = boards,
                fanRpms = fanRpms,
                hydro = if (miner.cooling == CoolingType.HYDRO) buildHydro(temps, mm) else null,
                pools = pools,
                uptimeSeconds = uptime,
                model = miner.model.ifBlank { deviceModel },
                firmwareVersion = firmwareVersion,
            )
        )
    }

    private fun firmwareLabel(vObj: JsonObject?, model: String): String {
        val keys = vObj?.keys.orEmpty()
        val bos = keys.firstOrNull { it.contains("bos", ignoreCase = true) }
        return when {
            bos != null -> "Braiins OS+ " + (vObj.strAny(bos) ?: "")
            model.contains("avalon", true) -> "Avalon / CGMiner"
            model.contains("antminer", true) || model.contains("bitmain", true) -> "Bitmain"
            else -> vObj.strAny("CGMiner", "BMMiner")?.let { "CGMiner $it" } ?: ""
        }.trim()
    }

    private fun buildBoards(temps: List<JsonObject>, mm: String, bitmain: JsonObject?): List<BoardStat> {
        if (temps.isNotEmpty()) {
            return temps.mapIndexed { i, t ->
                BoardStat(
                    index = t.num("ID")?.toInt() ?: i,
                    hashrateThs = 0.0,
                    chipTempC = t.numAny("Chip", "Chip temperature", "ChipTemp") ?: 0.0,
                    boardTempC = t.numAny("Board", "Board temperature", "PCB", "TempPCB") ?: 0.0,
                    chipsWorking = 0, chipsTotal = 0,
                )
            }
        }
        // Bitmain stock: temp2_x = chip temps, temp_x / temp_pcb_x = board temps
        if (bitmain != null) {
            val chip = (1..6).mapNotNull { bitmain.numAny("temp2_$it", "temp_chip$it") }
            val board = (1..6).mapNotNull { bitmain.numAny("temp_pcb$it", "temp$it") }
            val n = maxOf(chip.size, board.size)
            if (n > 0) return (0 until n).map { i ->
                BoardStat(i, 0.0, chip.getOrElse(i) { 0.0 }, board.getOrElse(i) { 0.0 }, 0, 0)
            }
        }
        // Avalon: single synthetic board from the MM string.
        val avTemp = mm.token("Temp")?.toDoubleOrNull()
        if (avTemp != null) {
            return listOf(BoardStat(0, 0.0, mm.token("TMax")?.toDoubleOrNull() ?: avTemp, avTemp, 0, 0))
        }
        return emptyList()
    }

    private fun buildFans(fans: List<JsonObject>, mm: String, bitmain: JsonObject?): List<Int> {
        if (fans.isNotEmpty()) return fans.mapNotNull { it.numAny("RPM", "Speed")?.toInt() }
        val avalon = (1..4).mapNotNull { mm.token("Fan$it")?.toIntOrNull() }
        if (avalon.isNotEmpty()) return avalon
        if (bitmain != null) return (1..8).mapNotNull { bitmain.num("fan$it")?.toInt() }.filter { it > 0 }
        return emptyList()
    }

    private fun avalonPower(mm: String): Double? =
        mm.token("WALLPOWER")?.toDoubleOrNull()
            ?: mm.token("PS", index = 5)?.toDoubleOrNull()
            ?: mm.token("Power")?.toDoubleOrNull()

    private fun buildHydro(temps: List<JsonObject>, mm: String): HydroStat? {
        // Avalon hydro packs coolant temps into the MM string.
        val avIn = mm.token("ITemp")?.toDoubleOrNull() ?: mm.token("WaterIn")?.toDoubleOrNull()
        if (avIn != null) {
            return HydroStat(
                inletTempC = avIn,
                outletTempC = mm.token("OTemp")?.toDoubleOrNull() ?: mm.token("WaterOut")?.toDoubleOrNull() ?: avIn,
                flowLpm = mm.token("Flow")?.toDoubleOrNull() ?: 0.0,
                pumpRpm = mm.token("Pump")?.toIntOrNull() ?: 0,
            )
        }
        // Braiins: scan temps entries for coolant-style keys, if exposed.
        fun find(vararg keys: String) = temps.firstNotNullOfOrNull { it.numAny(*keys) }
        val bIn = find("Water in", "Inlet", "WaterIn", "Coolant in") ?: return null
        return HydroStat(
            inletTempC = bIn,
            outletTempC = find("Water out", "Outlet", "WaterOut", "Coolant out") ?: bIn,
            flowLpm = find("Flow", "FlowRate") ?: 0.0,
        )
    }

    private fun normaliseGhs(summary: JsonObject, value: Double): Double =
        if (summary["GHS 5s"] != null || summary["GHS av"] != null) value else value / 1000.0

    override suspend fun reboot(miner: Miner): Result<Unit> =
        socket.command(miner.lanHost, port(miner), "restart").map { }

    override suspend fun fetchPools(miner: Miner): Result<List<PoolStat>> =
        socket.command(miner.lanHost, port(miner), "pools").map { element ->
            (element as? JsonObject)?.list("POOLS").orEmpty().mapIndexedNotNull { i, e ->
                val o = e as? JsonObject ?: return@mapIndexedNotNull null
                PoolStat(
                    index = i,
                    url = o.str("URL") ?: "",
                    user = o.str("User") ?: "",
                    status = o.str("Status") ?: "",
                    accepted = o.num("Accepted")?.toLong() ?: 0,
                    rejected = o.num("Rejected")?.toLong() ?: 0,
                )
            }
        }

    // --- helpers --------------------------------------------------------------

    private fun JsonObject?.mmString(): String =
        this?.let { o -> o.keys.firstOrNull { it.startsWith("MM ID") }?.let { o.str(it) } }.orEmpty()

    /** Pull a value out of an Avalon `Key[value]` token, optionally the Nth field. */
    private fun String.token(key: String, index: Int = 0): String? {
        val marker = "$key["
        val start = indexOf(marker)
        if (start < 0) return null
        val from = start + marker.length
        val end = indexOf(']', from)
        if (end < 0) return null
        val parts = substring(from, end).trim().split(' ').filter { it.isNotBlank() }
        return parts.getOrNull(index) ?: parts.firstOrNull()
    }
}
