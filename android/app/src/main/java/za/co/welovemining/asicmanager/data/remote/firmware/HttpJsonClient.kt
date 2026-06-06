package za.co.welovemining.asicmanager.data.remote.firmware

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Thin coroutine wrapper over OkHttp that returns parsed JSON. Shared by every
 * HTTP-based firmware adapter (VNish, Braiins web) and the tunnel gateway.
 */
class HttpJsonClient(
    private val client: OkHttpClient,
    private val json: Json = Json { ignoreUnknownKeys = true; isLenient = true },
) {
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    suspend fun getJson(
        url: String,
        bearer: String? = null,
        headers: Map<String, String> = emptyMap(),
    ): Result<JsonElement> = request(
        Request.Builder().url(url).get().applyHeaders(bearer, headers).build()
    )

    suspend fun postJson(
        url: String,
        body: String = "{}",
        bearer: String? = null,
        headers: Map<String, String> = emptyMap(),
    ): Result<JsonElement> = request(
        Request.Builder().url(url).post(body.toRequestBody(jsonMedia))
            .applyHeaders(bearer, headers).build()
    )

    /** POST where the response body is irrelevant (reboot/restart endpoints). */
    suspend fun postNoContent(
        url: String,
        body: String = "{}",
        bearer: String? = null,
        headers: Map<String, String> = emptyMap(),
    ): Result<Unit> = runCatching {
        withContext(Dispatchers.IO) {
            execute(
                Request.Builder().url(url).post(body.toRequestBody(jsonMedia))
                    .applyHeaders(bearer, headers).build()
            ).use { response ->
                if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            }
        }
    }

    private suspend fun request(req: Request): Result<JsonElement> = runCatching {
        withContext(Dispatchers.IO) {
            execute(req).use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) throw IOException("HTTP ${response.code}: ${text.take(200)}")
                json.parseToJsonElement(text.ifBlank { "{}" })
            }
        }
    }

    private fun Request.Builder.applyHeaders(bearer: String?, headers: Map<String, String>): Request.Builder {
        bearer?.let { header("Authorization", "Bearer $it") }
        headers.forEach { (k, v) -> header(k, v) }
        return this
    }

    private suspend fun execute(request: Request): Response =
        suspendCancellableCoroutine { cont ->
            val call = client.newCall(request)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) = cont.resumeWithException(e)
                override fun onResponse(call: Call, response: Response) = cont.resume(response)
            })
        }
}
