package za.co.welovemining.asicmanager.di

import android.content.Context
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import za.co.welovemining.asicmanager.data.remote.cgminer.CgminerSocketClient
import za.co.welovemining.asicmanager.data.remote.firmware.HttpJsonClient
import za.co.welovemining.asicmanager.data.repository.MinerRepository
import za.co.welovemining.asicmanager.data.settings.SettingsStore
import java.util.concurrent.TimeUnit

/**
 * Lightweight manual dependency container. Kept deliberately simple (no Hilt) so
 * the project compiles cleanly with zero annotation processors — every
 * dependency is a plain singleton created here and shared app-wide.
 */
class AppContainer(context: Context) {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    private val okHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    private val httpJson = HttpJsonClient(okHttp, json)
    private val cgminer = CgminerSocketClient(json)

    val settingsStore = SettingsStore(context.applicationContext)
    val repository = MinerRepository(httpJson, cgminer)
}
