package za.co.welovemining.asicmanager.data.remote.firmware

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
 * Adapter for Braiins OS+ (BOS+). Braiins keeps the cgminer-style socket API and
 * adds its own commands — `temps`, `fans`, `tunerstatus` — which we use to fill
 * the board temperatures, fan speeds and live power draw that plain cgminer
 * doesn't expose.
 *
 * The default API port is 4028. For a future revision the BOS+ gRPC Public API
 * (port 50051) would give richer control; this socket path covers monitoring,
 * pools and restart today.
 */
class BraiinsClient(
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

        val ghs5s = s.numAny("GHS 5s", "MHS 5s")?.let { normaliseToGhs(s, it) } ?: 0.0
        val ghsAv = s.numAny("GHS av", "MHS av")?.let { normaliseToGhs(s, it) } ?: ghs5s
        val uptime = s.num("Elapsed")?.toLong() ?: 0

        // version → device model (e.g. "Antminer S19 Hydro") + firmware string.
        val vObj = socket.command(host, p, "version").getOrNull()
            ?.let { (it as? JsonObject)?.list("VERSION")?.firstOrNull() } as? JsonObject
        val deviceModel = vObj.strAny("Type", "Miner", "Model").orEmpty()
        val fwVersion = vObj.strAny("BOSminer+", "BOSminer", "CGMiner", "BMMiner")
            ?.let { "Braiins OS+ $it" } ?: "Braiins OS+"

        val temps = socket.command(host, p, "temps").getOrNull()
            ?.let { (it as? JsonObject)?.list("TEMPS") }.orEmpty().mapNotNull { it as? JsonObject }
        val fans = socket.command(host, p, "fans").getOrNull()
            ?.let { (it as? JsonObject)?.list("FANS") }.orEmpty().mapNotNull { it as? JsonObject }
        val tuner = socket.command(host, p, "tunerstatus").getOrNull()
            ?.let { (it as? JsonObject)?.list("TUNERSTATUS").orEmpty().firstOrNull() } as? JsonObject

        // Prefer the dedicated `temps` command; fall back to per-device temps in `devs`.
        val boards = if (temps.isNotEmpty()) {
            temps.mapIndexed { i, t ->
                BoardStat(
                    index = t.num("ID")?.toInt() ?: i,
                    hashrateThs = 0.0,
                    chipTempC = t.numAny("Chip", "Chip temperature", "ChipTemp") ?: 0.0,
                    boardTempC = t.numAny("Board", "Board temperature", "PCB", "TempPCB") ?: 0.0,
                    chipsWorking = 0,
                    chipsTotal = 0,
                )
            }
        } else {
            socket.command(host, p, "devs").getOrNull()
                ?.let { (it as? JsonObject)?.list("DEVS") }.orEmpty().mapNotNull { it as? JsonObject }
                .mapIndexed { i, d ->
                    BoardStat(
                        index = d.num("ASC")?.toInt() ?: d.num("ID")?.toInt() ?: i,
                        hashrateThs = ghsToThs(d.numAny("MHS 5s", "GHS 5s")),
                        chipTempC = d.numAny("Temperature", "Chip") ?: 0.0,
                        boardTempC = d.numAny("Temperature", "Board") ?: 0.0,
                        chipsWorking = 0,
                        chipsTotal = 0,
                    )
                }
        }
        val fanRpms = fans.mapNotNull { it.numAny("RPM", "Speed")?.toInt() }
        val power = tuner.numAny(
            "ApproximateMinerPowerConsumption",
            "PowerConsumption",
            "MinerPowerConsumption",
            "PowerLimit",
        ) ?: s.numAny("Power", "Power_RT") ?: 0.0

        val maxTemp = boards.maxOfOrNull { maxOf(it.chipTempC, it.boardTempC) } ?: 0.0
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
                hydro = if (miner.cooling == CoolingType.HYDRO) parseHydro(temps) else null,
                pools = pools,
                uptimeSeconds = uptime,
                model = miner.model.ifBlank { deviceModel },
                firmwareVersion = fwVersion,
            )
        )
    }

    private fun ghsToThs(ghs: Double?): Double = (ghs ?: 0.0) / 1000.0

    /** If the firmware reported MHS rather than GHS, scale down. */
    private fun normaliseToGhs(summary: JsonObject, value: Double): Double =
        if (summary["GHS 5s"] != null || summary["GHS av"] != null) value else value / 1000.0

    private fun parseHydro(temps: List<JsonObject>): HydroStat? {
        // Some Braiins Hydro builds surface coolant sensors in `temps`; scan
        // every entry for inlet/outlet-style keys before giving up.
        fun find(vararg keys: String) = temps.firstNotNullOfOrNull { it.numAny(*keys) }
        val inlet = find("Water in", "Inlet", "WaterIn", "Coolant in", "InletTemp") ?: return null
        val outlet = find("Water out", "Outlet", "WaterOut", "Coolant out", "OutletTemp") ?: inlet
        return HydroStat(
            inletTempC = inlet,
            outletTempC = outlet,
            flowLpm = find("Flow", "FlowRate") ?: 0.0,
        )
    }

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
}
