package za.co.welovemining.asicmanager.data.discovery

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
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
        if (tcpOpen(host, CgminerSocketClient.DEFAULT_PORT)) {
            val version = cgminer.command(host, command = "version", timeoutMs = 2_000).getOrNull()
            val type = versionType(version)
            val firmware = classify(type)
            val model = cgminer.command(host, command = "stats", timeoutMs = 2_000).getOrNull()
                ?.let { extractModel(it.toString()) } ?: type
            return DiscoveredMiner(host, firmware, model, CgminerSocketClient.DEFAULT_PORT)
        }
        if (tcpOpen(host, 80)) {
            val info = http.getJson("http://$host/api/v1/info", null).getOrNull()
            val model = info.strAny("miner_type", "model") ?: ""
            val firmware = if (info != null) FirmwareType.VNISH else FirmwareType.UNKNOWN
            return DiscoveredMiner(host, firmware, model, 80)
        }
        return null
    }

    private fun versionType(version: kotlinx.serialization.json.JsonElement?): String {
        val arr = (version as? kotlinx.serialization.json.JsonObject)
            ?.get("VERSION") as? kotlinx.serialization.json.JsonArray ?: return ""
        val first = arr.firstOrNull() as? kotlinx.serialization.json.JsonObject
        return first.strAny("Type", "Miner", "BOSminer", "CGMiner") ?: ""
    }

    private fun classify(type: String): FirmwareType {
        val t = type.lowercase()
        return when {
            "braiins" in t || "bos" in t -> FirmwareType.BRAIINS
            "avalon" in t -> FirmwareType.AVALON
            "vnish" in t -> FirmwareType.VNISH
            "antminer" in t || "bitmain" in t -> FirmwareType.BITMAIN
            else -> FirmwareType.UNKNOWN
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
        private const val MAX_PARALLEL = 48
        private const val MAX_HOSTS = 1024
        private const val CONNECT_TIMEOUT_MS = 350
    }
}
