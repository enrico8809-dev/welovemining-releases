package za.co.welovemining.asicmanager.data.discovery

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import za.co.welovemining.asicmanager.data.model.FirmwareType
import za.co.welovemining.asicmanager.data.remote.cgminer.CgminerSocketClient
import za.co.welovemining.asicmanager.data.remote.firmware.HttpJsonClient
import za.co.welovemining.asicmanager.data.remote.firmware.strAny
import java.net.InetSocketAddress
import java.net.Socket

/** A candidate miner found on the LAN, ready to be added to the fleet. */
data class DiscoveredMiner(
    val host: String,
    val firmware: FirmwareType,
    val model: String,
    val port: Int,
)

/**
 * Sweeps a CIDR subnet and fingerprints anything that answers on the cgminer
 * socket (4028) or HTTP (80). Detection is best-effort: the cgminer `version`
 * "Type" field separates Braiins / Avalon / Bitmain, while an HTTP-only host
 * that responds to the VNish API is tagged VNish.
 */
class MinerDiscovery(
    private val http: HttpJsonClient,
    private val cgminer: CgminerSocketClient,
) {
    suspend fun scan(
        cidr: String,
        onProgress: (done: Int, total: Int) -> Unit = { _, _ -> },
    ): List<DiscoveredMiner> {
        val hosts = expandCidr(cidr) ?: return emptyList()
        val gate = Semaphore(MAX_PARALLEL)
        var done = 0
        return coroutineScope {
            hosts.map { host ->
                async(Dispatchers.IO) {
                    gate.withPermit { probe(host) }.also {
                        synchronized(this@MinerDiscovery) { onProgress(++done, hosts.size) }
                    }
                }
            }.awaitAll().filterNotNull()
        }
    }

    private suspend fun probe(host: String): DiscoveredMiner? {
        // An open cgminer/bmminer port (4028) is a strong miner signal in itself
        // — almost nothing else listens there. Try to classify via the API, but
        // still report the host as a miner if that call fails (it often does
        // under the load of a full subnet scan).
        if (tcpOpen(host, CgminerSocketClient.DEFAULT_PORT)) {
            val version = cgminer.command(host, command = "version", timeoutMs = 3_000).getOrNull()
            val vObj = (version as? JsonObject)?.get("VERSION").let { it as? JsonArray }
                ?.firstOrNull() as? JsonObject
            var type = vObj.strAny("Type", "Miner", "Model").orEmpty()
            val firmware = if (isCgminerReply(version)) {
                classifyCgminer(version as? JsonObject, vObj, type)
            } else {
                // Couldn't classify, but the port is a miner port — default to the
                // general Braiins-style adapter (handles Braiins/Bitmain stock).
                FirmwareType.BRAIINS
            }
            if (type.isBlank()) {
                type = cgminer.command(host, command = "stats", timeoutMs = 3_000).getOrNull()
                    ?.let { extractModel(it.toString()) }.orEmpty()
            }
            return DiscoveredMiner(host, firmware, type, CgminerSocketClient.DEFAULT_PORT)
        }
        // VNish HTTP API. A web server merely listening on :80 (router, NAS,
        // printer, camera…) is NOT a miner — require a VNish-shaped response.
        if (tcpOpen(host, 80)) {
            val body = http.getJson("http://$host/api/v1/summary", null).getOrNull()
                ?: http.getJson("http://$host/api/v1/info", null).getOrNull()
            if (looksLikeVnish(body)) {
                val m = (body as? JsonObject)?.get("miner") ?: body
                val model = m.strAny("miner_type", "model") ?: body.strAny("miner_type", "model") ?: ""
                return DiscoveredMiner(host, FirmwareType.VNISH, model, 80)
            }
        }
        return null
    }

    /** True only if the payload is a genuine cgminer/bmminer API reply. */
    private fun isCgminerReply(el: JsonElement?): Boolean {
        val o = el as? JsonObject ?: return false
        return o["VERSION"] is JsonArray || o["STATUS"] is JsonArray
    }

    /** True only if the payload carries fields unique to the VNish miner API. */
    private fun looksLikeVnish(el: JsonElement?): Boolean {
        val o = el as? JsonObject ?: return false
        if (o["miner"] is JsonObject) return true
        val keys = listOf("miner_type", "instant_hashrate", "average_hashrate", "chains", "hr_realtime", "power_usage")
        return keys.any { o[it] != null }
    }

    /**
     * Classify a cgminer responder. Braiins OS+ advertises a `BOSminer*` key in
     * its version object, which cleanly separates it from stock Bitmain even
     * though both report an "Antminer …" type. Anything else that speaks the
     * cgminer API defaults to the general Braiins-style adapter.
     */
    private fun classifyCgminer(root: JsonObject?, version: JsonObject?, type: String): FirmwareType {
        val keys = (version?.keys.orEmpty() + root?.keys.orEmpty())
        val hasBos = keys.any { it.contains("bos", ignoreCase = true) }
        val t = type.lowercase()
        return when {
            hasBos || "braiins" in t || "bos" in t -> FirmwareType.BRAIINS
            "avalon" in t -> FirmwareType.AVALON
            "vnish" in t -> FirmwareType.VNISH
            "antminer" in t || "bitmain" in t -> FirmwareType.BITMAIN
            else -> FirmwareType.BRAIINS
        }
    }

    private fun extractModel(statsText: String): String {
        // Pull an Antminer/Avalon model token out of the free-form stats string.
        Regex("(Antminer\\s?[A-Z0-9+ ]+|Avalon[A-Za-z0-9]+)").find(statsText)?.let {
            return it.value.trim()
        }
        return ""
    }

    private suspend fun tcpOpen(host: String, port: Int): Boolean = withContext(Dispatchers.IO) {
        withTimeoutOrNull(CONNECT_TIMEOUT_MS.toLong()) {
            runCatching {
                Socket().use { it.connect(InetSocketAddress(host, port), CONNECT_TIMEOUT_MS); true }
            }.getOrDefault(false)
        } ?: false
    }

    /** Expand an IPv4 CIDR into host addresses. Caps at [MAX_HOSTS] for safety. */
    private fun expandCidr(cidr: String): List<String>? {
        val parts = cidr.trim().split("/")
        if (parts.size != 2) return null
        val prefix = parts[1].toIntOrNull() ?: return null
        val octets = parts[0].split(".").mapNotNull { it.toIntOrNull() }
        if (octets.size != 4 || prefix !in 8..32) return null
        val base = octets.fold(0L) { acc, o -> (acc shl 8) or (o.toLong() and 0xFF) }
        val hostBits = 32 - prefix
        val count = (1L shl hostBits)
        if (count - 2 > MAX_HOSTS) return null
        val network = base and (0xFFFFFFFFL shl hostBits)
        val first = if (hostBits >= 1) network + 1 else network
        val last = if (hostBits >= 1) network + count - 2 else network
        return (first..last).map { addr ->
            "${(addr shr 24) and 0xFF}.${(addr shr 16) and 0xFF}.${(addr shr 8) and 0xFF}.${addr and 0xFF}"
        }
    }

    companion object {
        private const val MAX_PARALLEL = 32
        private const val MAX_HOSTS = 1024
        private const val CONNECT_TIMEOUT_MS = 500
    }
}
