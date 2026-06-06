package za.co.welovemining.asicmanager.data.remote.firmware

import kotlinx.serialization.json.JsonObject
import za.co.welovemining.asicmanager.data.model.BoardStat
import za.co.welovemining.asicmanager.data.model.CoolingType
import za.co.welovemining.asicmanager.data.model.HydroStat
import za.co.welovemining.asicmanager.data.model.Miner
import za.co.welovemining.asicmanager.data.model.MinerState
import za.co.welovemining.asicmanager.data.model.MinerStats
import za.co.welovemining.asicmanager.data.model.PoolStat

/**
 * Adapter for VNish firmware's HTTP REST API.
 *
 * Auth flow: POST /api/v1/unlock {"pw": "..."} returns a bearer token, which is
 * then sent on every subsequent request. We cache the token per host and
 * re-unlock transparently on a 401.
 */
class VnishClient(
    private val http: HttpJsonClient,
) : MinerApiClient {

    private val tokens = mutableMapOf<String, String>()

    private fun base(miner: Miner): String {
        val port = miner.port?.let { ":$it" } ?: ""
        return "http://${miner.lanHost}$port/api/v1"
    }

    private suspend fun token(miner: Miner): String? {
        tokens[miner.lanHost]?.let { return it }
        if (miner.password.isBlank()) return null
        val resp = http.postJson("${base(miner)}/unlock", "{\"pw\":\"${miner.password}\"}").getOrNull()
        val t = resp.strAny("token", "access_token")
        if (t != null) tokens[miner.lanHost] = t
        return t
    }

    override suspend fun fetchStats(miner: Miner): Result<MinerStats> {
        val token = token(miner)
        val summary = http.getJson("${base(miner)}/summary", bearer = token).getOrElse {
            return Result.success(MinerStats.offline(miner.id, it.message))
        }
        // VNish nests live data under "miner"; tolerate both nested and flat shapes.
        val m = (summary as? JsonObject)?.get("miner") ?: summary

        val instant = m.numAny("instant_hashrate", "hr_realtime", "hashrate_rt") ?: 0.0
        val average = m.numAny("average_hashrate", "hr_average", "hashrate_avg") ?: instant
        val power = m.numAny("power_usage", "power_consumption", "power") ?: 0.0

        val chains = m.list("chains").mapNotNull { it as? JsonObject }
        val boards = chains.mapIndexed { i, c ->
            val working = c.numAny("chip_statuses_red", "chips_alive")?.toInt()
            BoardStat(
                index = c.num("id")?.toInt() ?: i,
                hashrateThs = ghsToThs(c.numAny("hashrate_rt", "hr_realtime")),
                chipTempC = c.numAny("temp_chip", "temp_max", "chip_temp") ?: 0.0,
                boardTempC = c.numAny("temp_pcb", "pcb_temp", "temp") ?: 0.0,
                chipsWorking = working ?: 0,
                chipsTotal = c.num("chip_count")?.toInt() ?: 0,
                frequencyMhz = c.numAny("freq", "frequency") ?: 0.0,
                voltageMv = c.numAny("voltage", "volt") ?: 0.0,
            )
        }

        val fans = (m.list("fans").ifEmpty { m.obj("cooling").list("fans") })
            .mapNotNull { fan -> (fan as? JsonObject).numAny("rpm", "speed")?.toInt() }

        val maxTemp = boards.maxOfOrNull { maxOf(it.chipTempC, it.boardTempC) } ?: 0.0

        val pools = m.list("pools").mapIndexedNotNull { i, p ->
            val po = p as? JsonObject ?: return@mapIndexedNotNull null
            PoolStat(
                index = i,
                url = po.str("url") ?: "",
                user = po.strAny("user", "worker") ?: "",
                status = po.strAny("status", "state") ?: "",
                accepted = po.num("accepted")?.toLong() ?: 0,
                rejected = po.num("rejected")?.toLong() ?: 0,
            )
        }

        val hashrate = ghsToThs(instant)
        return Result.success(
            MinerStats(
                minerId = miner.id,
                state = if (hashrate > 0) MinerState.ONLINE else MinerState.WARNING,
                hashrateThs = hashrate,
                avgHashrateThs = ghsToThs(average),
                powerW = power,
                efficiencyJTh = if (hashrate > 0) power / hashrate else 0.0,
                maxTempC = maxTemp,
                boards = boards,
                fanRpms = fans,
                hydro = if (miner.cooling == CoolingType.HYDRO) parseHydro(m) else null,
                pools = pools,
                uptimeSeconds = m.numAny("uptime", "elapsed")?.toLong() ?: 0,
                model = m.strAny("miner_type", "model") ?: miner.model,
                firmwareVersion = m.strAny("fw_version", "version") ?: "",
            )
        )
    }

    private fun parseHydro(m: kotlinx.serialization.json.JsonElement?): HydroStat? {
        val cooling = m.obj("cooling") ?: m.obj("hydro") ?: return null
        val inlet = cooling.numAny("water_in", "inlet_temp", "temp_in") ?: return null
        return HydroStat(
            inletTempC = inlet,
            outletTempC = cooling.numAny("water_out", "outlet_temp", "temp_out") ?: inlet,
            flowLpm = cooling.numAny("flow", "flow_rate", "water_flow") ?: 0.0,
            pumpRpm = cooling.numAny("pump_rpm", "pump")?.toInt() ?: 0,
        )
    }

    override suspend fun reboot(miner: Miner): Result<Unit> =
        http.postNoContent("${base(miner)}/system/reboot", bearer = token(miner))

    override suspend fun pause(miner: Miner): Result<Unit> =
        http.postNoContent("${base(miner)}/mining/pause", bearer = token(miner))

    override suspend fun resume(miner: Miner): Result<Unit> =
        http.postNoContent("${base(miner)}/mining/resume", bearer = token(miner))

    override suspend fun fetchPools(miner: Miner): Result<List<PoolStat>> =
        fetchStats(miner).map { it.pools }

    override suspend fun locate(miner: Miner, on: Boolean): Result<Unit> =
        http.postNoContent("${base(miner)}/find-miner", bearer = token(miner))

    /** VNish reports hashrate in GH/s; the app works in TH/s. */
    private fun ghsToThs(ghs: Double?): Double = (ghs ?: 0.0) / 1000.0
}
