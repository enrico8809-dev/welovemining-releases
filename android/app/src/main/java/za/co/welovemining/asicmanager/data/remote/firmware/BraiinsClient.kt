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

        val temps = socket.command(host, p, "temps").getOrNull()
            ?.let { (it as? JsonObject)?.list("TEMPS") }.orEmpty().mapNotNull { it as? JsonObject }
        val fans = socket.command(host, p, "fans").getOrNull()
            ?.let { (it as? JsonObject)?.list("FANS") }.orEmpty().mapNotNull { it as? JsonObject }
        val tuner = socket.command(host, p, "tunerstatus").getOrNull()
            ?.let { (it as? JsonObject)?.list("TUNERSTATUS").orEmpty().firstOrNull() } as? JsonObject

        val boards = temps.mapIndexed { i, t ->
            BoardStat(
                index = t.num("ID")?.toInt() ?: i,
                hashrateThs = 0.0,
                chipTempC = t.numAny("Chip", "Chip temperature") ?: 0.0,
                boardTempC = t.numAny("Board", "Board temperature") ?: 0.0,
                chipsWorking = 0,
                chipsTotal = 0,
            )
        }
        val fanRpms = fans.mapNotNull { it.numAny("RPM", "Speed")?.toInt() }
        val power = tuner.numAny(
            "ApproximateMinerPowerConsumption",
            "PowerConsumption",
            "PowerLimit",
        ) ?: 0.0

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
                model = miner.model,
                firmwareVersion = "Braiins OS+",
            )
        )
    }

    /** If the firmware reported MHS rather than GHS, scale down. */
    private fun normaliseToGhs(summary: JsonObject, value: Double): Double =
        if (summary["GHS 5s"] != null || summary["GHS av"] != null) value else value / 1000.0

    private fun parseHydro(temps: List<JsonObject>): HydroStat? {
        val inlet = temps.firstNotNullOfOrNull { it.numAny("Water in", "Inlet") } ?: return null
        val outlet = temps.firstNotNullOfOrNull { it.numAny("Water out", "Outlet") } ?: inlet
        return HydroStat(inletTempC = inlet, outletTempC = outlet, flowLpm = 0.0)
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
