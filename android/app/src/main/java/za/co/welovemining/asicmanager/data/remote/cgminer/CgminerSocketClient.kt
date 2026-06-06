package za.co.welovemining.asicmanager.data.remote.cgminer

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Minimal client for the cgminer/bmminer JSON API (TCP, default port 4028).
 *
 * The protocol is request/response over a short-lived socket: send a single
 * JSON command, the daemon writes the reply and closes the connection. Many
 * builds NUL-terminate the reply and leak invalid JSON control characters,
 * both of which we strip before parsing.
 *
 * Used directly by Avalon (CGMiner) miners and available as a fallback for any
 * firmware that keeps the legacy socket API enabled.
 */
class CgminerSocketClient(
    private val json: Json = Json { ignoreUnknownKeys = true; isLenient = true },
) {
    /** Send a raw command (e.g. summary) and return the parsed JSON. */
    suspend fun command(
        host: String,
        port: Int = DEFAULT_PORT,
        command: String,
        parameter: String? = null,
        timeoutMs: Long = 5_000,
    ): Result<JsonElement> = runCatching {
        val payload = buildString {
            append("{\"command\":\"").append(command).append("\"")
            if (parameter != null) append(",\"parameter\":\"").append(parameter).append("\"")
            append("}")
        }
        val raw = withContext(Dispatchers.IO) {
            withTimeout(timeoutMs) {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(host, port), timeoutMs.toInt())
                    socket.getOutputStream().apply {
                        write(payload.toByteArray(Charsets.UTF_8))
                        flush()
                    }
                    socket.getInputStream().readBytes()
                }
            }
        }
        // Cut at the NUL terminator and drop stray control bytes, but keep
        // spaces because pool URLs and model strings legitimately contain them.
        val decoded = raw.toString(Charsets.UTF_8)
        val cut = decoded.substringBefore('\u0000')
        val text = sanitizeControlChars(cut).trim()
        json.parseToJsonElement(text)
    }

    /** Drop ASCII control characters the cgminer API leaks into otherwise-valid JSON. */
    private fun sanitizeControlChars(text: String): String =
        buildString(text.length) {
            for (c in text) if (c.code >= 0x20 || c == '\n' || c == '\t') append(c)
        }

    companion object {
        const val DEFAULT_PORT = 4028
    }
}
