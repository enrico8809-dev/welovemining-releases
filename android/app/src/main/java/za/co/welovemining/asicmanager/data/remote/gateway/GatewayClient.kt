package za.co.welovemining.asicmanager.data.remote.gateway

import kotlinx.serialization.json.JsonObject
import za.co.welovemining.asicmanager.data.model.BoardStat
import za.co.welovemining.asicmanager.data.model.CoolingType
import za.co.welovemining.asicmanager.data.model.FirmwareType
import za.co.welovemining.asicmanager.data.model.HydroStat
import za.co.welovemining.asicmanager.data.model.Miner
import za.co.welovemining.asicmanager.data.model.MinerState
import za.co.welovemining.asicmanager.data.model.MinerStats
import za.co.welovemining.asicmanager.data.model.MinerWithStats
import za.co.welovemining.asicmanager.data.model.PoolStat
import za.co.welovemining.asicmanager.data.remote.firmware.HttpJsonClient
import za.co.welovemining.asicmanager.data.remote.firmware.arr
import za.co.welovemining.asicmanager.data.remote.firmware.list
import za.co.welovemining.asicmanager.data.remote.firmware.num
import za.co.welovemining.asicmanager.data.remote.firmware.numAny
import za.co.welovemining.asicmanager.data.remote.firmware.obj
import za.co.welovemining.asicmanager.data.remote.firmware.str

/**
 * Talks to the WLM gateway aggregator that runs at the mining site and is
 * published over the Cloudflare tunnel. The gateway has already discovered the
 * LAN, polled each firmware and normalized the readings, so the app fetches the
 * whole fleet in a single round-trip — ideal for the high-latency remote path.
 *
 * Expected contract (served by the gateway):
 *   GET  {base}/api/v1/fleet            -> { "miners": [ { ...miner+stats... } ] }
 *   POST {base}/api/v1/miners/{id}/reboot
 *   POST {base}/api/v1/miners/{id}/locate { "on": true }
 *
 * Auth is a bearer token (or a Cloudflare Access service token forwarded as a
 * header). The gateway JSON deliberately mirrors the app's own model so mapping
 * stays trivial.
 */
class GatewayClient(
    private val http: HttpJsonClient,
) {
    /** Fetch the entire fleet (configured miners + their latest stats). */
    suspend fun fetchFleet(baseUrl: String, token: String?): Result<List<MinerWithStats>> =
        http.getJson("${baseUrl.trimEnd('/')}/api/v1/fleet", bearer = token).map { root ->
            root.list("miners").mapNotNull { (it as? JsonObject)?.let(::parseEntry) }
        }

    suspend fun reboot(baseUrl: String, token: String?, minerId: String): Result<Unit> =
        http.postNoContent("${baseUrl.trimEnd('/')}/api/v1/miners/$minerId/reboot", bearer = token)

    suspend fun locate(baseUrl: String, token: String?, minerId: String, on: Boolean): Result<Unit> =
        http.postNoContent(
            "${baseUrl.trimEnd('/')}/api/v1/miners/$minerId/locate",
            body = "{\"on\":$on}",
            bearer = token,
        )

    private fun parseEntry(o: JsonObject): MinerWithStats {
        val id = o.str("id") ?: o.str("mac") ?: o.str("host") ?: return MinerWithStats(
            Miner(id = "unknown", name = "Unknown", lanHost = ""), null,
        )
        val miner = Miner(
            id = id,
            name = o.str("name") ?: id,
            lanHost = o.str("host") ?: o.str("ip") ?: "",
            model = o.str("model") ?: "",
            firmware = FirmwareType.fromId(o.str("firmware")),
            cooling = if ((o.str("cooling") ?: "").equals("hydro", true)) CoolingType.HYDRO else CoolingType.AIR,
            groupName = o.str("group") ?: "Default",
        )
        val statsObj = o.obj("stats") ?: return MinerWithStats(miner, null)
        return MinerWithStats(miner, parseStats(id, statsObj, miner.cooling))
    }

    private fun parseStats(id: String, s: JsonObject, cooling: CoolingType): MinerStats {
        val state = when ((s.str("state") ?: "").uppercase()) {
            "ONLINE" -> MinerState.ONLINE
            "WARNING" -> MinerState.WARNING
            "ERROR" -> MinerState.ERROR
            else -> MinerState.OFFLINE
        }
        val hashrate = s.numAny("hashrateThs", "hashrate") ?: 0.0
        val power = s.numAny("powerW", "power") ?: 0.0
        val boards = s.list("boards").mapNotNull { b ->
            val bo = b as? JsonObject ?: return@mapNotNull null
            BoardStat(
                index = bo.num("index")?.toInt() ?: 0,
                hashrateThs = bo.num("hashrateThs") ?: 0.0,
                chipTempC = bo.numAny("chipTempC", "chip") ?: 0.0,
                boardTempC = bo.numAny("boardTempC", "board") ?: 0.0,
                chipsWorking = bo.num("chipsWorking")?.toInt() ?: 0,
                chipsTotal = bo.num("chipsTotal")?.toInt() ?: 0,
            )
        }
        val hydro = if (cooling == CoolingType.HYDRO) s.obj("hydro")?.let {
            HydroStat(
                inletTempC = it.numAny("inletTempC", "in") ?: 0.0,
                outletTempC = it.numAny("outletTempC", "out") ?: 0.0,
                flowLpm = it.numAny("flowLpm", "flow") ?: 0.0,
                pumpRpm = it.num("pumpRpm")?.toInt() ?: 0,
            )
        } else null
        val pools = s.list("pools").mapIndexedNotNull { i, p ->
            val po = p as? JsonObject ?: return@mapIndexedNotNull null
            PoolStat(
                index = i,
                url = po.str("url") ?: "",
                user = po.str("user") ?: "",
                status = po.str("status") ?: "",
                accepted = po.num("accepted")?.toLong() ?: 0,
                rejected = po.num("rejected")?.toLong() ?: 0,
            )
        }
        return MinerStats(
            minerId = id,
            state = state,
            hashrateThs = hashrate,
            avgHashrateThs = s.numAny("avgHashrateThs", "avgHashrate") ?: hashrate,
            powerW = power,
            efficiencyJTh = s.num("efficiencyJTh") ?: if (hashrate > 0) power / hashrate else 0.0,
            maxTempC = s.numAny("maxTempC", "maxTemp") ?: (boards.maxOfOrNull { maxOf(it.chipTempC, it.boardTempC) } ?: 0.0),
            boards = boards,
            fanRpms = (s.arr("fanRpms"))?.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: emptyList(),
            hydro = hydro,
            pools = pools,
            uptimeSeconds = s.num("uptimeSeconds")?.toLong() ?: 0,
            model = s.str("model") ?: "",
            firmwareVersion = s.str("firmwareVersion") ?: "",
        )
    }
}
