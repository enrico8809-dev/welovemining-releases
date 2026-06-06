package za.co.welovemining.asicmanager.data.remote.firmware

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.floatOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import za.co.welovemining.asicmanager.data.model.BoardStat
import za.co.welovemining.asicmanager.data.model.CoolingType
import za.co.welovemining.asicmanager.data.model.HydroStat
import za.co.welovemining.asicmanager.data.model.Miner
import za.co.welovemining.asicmanager.data.model.MinerState
import za.co.welovemining.asicmanager.data.model.MinerStats
import za.co.welovemining.asicmanager.data.model.PoolStat
import za.co.welovemining.asicmanager.data.remote.cgminer.CgminerSocketClient

/**
 * Adapter for AvalonMiner / Canaan devices speaking the CGMiner socket API.
 *
 * Avalon packs most of its detail into the free-form "MM ID0" string inside the
 * STATS reply (tokens like `Temp[55]`, `TMax[72]`, `Fan1[3600]`, `GHSmm[...]`).
 * We pull the headline numbers from `summary` and enrich from `stats`.
 */
class AvalonClient(
    private val socket: CgminerSocketClient,
) : MinerApiClient {

    override suspend fun fetchStats(miner: Miner): Result<MinerStats> {
        val host = miner.lanHost
        val port = miner.port ?: CgminerSocketClient.DEFAULT_PORT

        val summary = socket.command(host, port, "summary").getOrElse {
            return Result.success(MinerStats.offline(miner.id, it.message))
        }
        val summaryObj = firstObjectOf(summary, "SUMMARY")
            ?: return Result.success(MinerStats.offline(miner.id, "no SUMMARY section"))

        val ghs5s = summaryObj.numberOrNull("GHS 5s") ?: summaryObj.numberOrNull("MHS 5s")?.div(1000.0) ?: 0.0
        val ghsAv = summaryObj.numberOrNull("GHS av") ?: summaryObj.numberOrNull("MHS av")?.div(1000.0) ?: 0.0
        val uptime = (summaryObj.numberOrNull("Elapsed") ?: 0.0).toLong()

        // stats holds temps / fans / power in the MM string
        val mm = runCatching {
            socket.command(host, port, "stats").getOrNull()
                ?.let { firstObjectOf(it, "STATS") }
                ?.mmString()
        }.getOrNull().orEmpty()

        val maxTemp = mm.token("TMax")?.toDoubleOrNull()
            ?: mm.token("Temp")?.toDoubleOrNull() ?: 0.0
        val power = mm.token("PS", index = 5)?.toDoubleOrNull() // PS reports the input watts on many models
            ?: mm.token("WALLPOWER")?.toDoubleOrNull() ?: 0.0
        val fans = listOfNotNull(
            mm.token("Fan1")?.toIntOrNull(),
            mm.token("Fan2")?.toIntOrNull(),
            mm.token("Fan3")?.toIntOrNull(),
            mm.token("Fan4")?.toIntOrNull(),
        )

        val pools = fetchPools(miner).getOrDefault(emptyList())

        val hashrate = if (ghs5s > 0) ghs5s / 1000.0 else 0.0 // GHS -> THS
        val avg = if (ghsAv > 0) ghsAv / 1000.0 else hashrate

        return Result.success(
            MinerStats(
                minerId = miner.id,
                state = if (hashrate > 0) MinerState.ONLINE else MinerState.WARNING,
                hashrateThs = hashrate,
                avgHashrateThs = avg,
                powerW = power,
                efficiencyJTh = if (hashrate > 0) power / hashrate else 0.0,
                maxTempC = maxTemp,
                boards = parseBoards(mm),
                fanRpms = fans,
                hydro = if (miner.cooling == CoolingType.HYDRO) parseHydro(mm) else null,
                pools = pools,
                uptimeSeconds = uptime,
                model = miner.model,
                firmwareVersion = mm.token("Ver") ?: "",
            )
        )
    }

    private fun parseBoards(mm: String): List<BoardStat> {
        // Avalon exposes per-board temps as MTavg[a b c]; we surface a single
        // synthetic board when granular data isn't trivially parseable.
        val temp = mm.token("Temp")?.toDoubleOrNull() ?: return emptyList()
        return listOf(
            BoardStat(
                index = 0,
                hashrateThs = 0.0,
                chipTempC = mm.token("TMax")?.toDoubleOrNull() ?: temp,
                boardTempC = temp,
                chipsWorking = 0,
                chipsTotal = 0,
            )
        )
    }

    private fun parseHydro(mm: String): HydroStat? {
        val inlet = mm.token("ITemp")?.toDoubleOrNull() ?: return null
        val outlet = mm.token("OTemp")?.toDoubleOrNull() ?: inlet
        return HydroStat(
            inletTempC = inlet,
            outletTempC = outlet,
            flowLpm = mm.token("Flow")?.toDoubleOrNull() ?: 0.0,
            pumpRpm = mm.token("Pump")?.toIntOrNull() ?: 0,
        )
    }

    override suspend fun reboot(miner: Miner): Result<Unit> {
        val host = miner.lanHost
        val port = miner.port ?: CgminerSocketClient.DEFAULT_PORT
        return socket.command(host, port, "restart").map { }
    }

    override suspend fun fetchPools(miner: Miner): Result<List<PoolStat>> {
        val host = miner.lanHost
        val port = miner.port ?: CgminerSocketClient.DEFAULT_PORT
        return socket.command(host, port, "pools").map { element ->
            val arr = (element as? JsonObject)?.get("POOLS")?.jsonArray ?: return@map emptyList()
            arr.mapIndexedNotNull { i, e ->
                val o = e as? JsonObject ?: return@mapIndexedNotNull null
                PoolStat(
                    index = i,
                    url = o.stringOrNull("URL") ?: "",
                    user = o.stringOrNull("User") ?: "",
                    status = o.stringOrNull("Status") ?: "",
                    accepted = (o.numberOrNull("Accepted") ?: 0.0).toLong(),
                    rejected = (o.numberOrNull("Rejected") ?: 0.0).toLong(),
                )
            }
        }
    }

    // --- helpers -----------------------------------------------------------

    private fun firstObjectOf(element: kotlinx.serialization.json.JsonElement, key: String): JsonObject? =
        (element as? JsonObject)?.get(key)?.jsonArray?.firstOrNull()?.jsonObject

    private fun JsonObject.mmString(): String =
        stringOrNull("MM ID0") ?: stringOrNull("MM ID1") ?: ""

    private fun JsonObject.numberOrNull(key: String): Double? =
        this[key]?.jsonPrimitive?.floatOrNull?.toDouble()

    private fun JsonObject.stringOrNull(key: String): String? =
        this[key]?.jsonPrimitive?.content

    /** Pull a value out of an Avalon `Key[value]` token, optionally the Nth space-separated field. */
    private fun String.token(key: String, index: Int = 0): String? {
        val marker = "$key["
        val start = indexOf(marker)
        if (start < 0) return null
        val from = start + marker.length
        val end = indexOf(']', from)
        if (end < 0) return null
        val body = substring(from, end).trim()
        val parts = body.split(' ').filter { it.isNotBlank() }
        return parts.getOrNull(index) ?: parts.firstOrNull()
    }
}
