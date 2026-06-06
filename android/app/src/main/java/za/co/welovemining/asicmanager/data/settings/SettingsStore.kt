package za.co.welovemining.asicmanager.data.settings

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import za.co.welovemining.asicmanager.data.model.Miner

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "wlm_settings")

/**
 * Single source of truth for persisted state — app settings plus the configured
 * fleet. Everything is stored as JSON under two keys so the schema can evolve
 * without DataStore migrations.
 */
class SettingsStore(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val settingsKey = stringPreferencesKey("app_settings")
    private val minersKey = stringPreferencesKey("miners")

    val settings: Flow<AppSettings> = context.dataStore.data.map { prefs ->
        prefs[settingsKey]?.let { runCatching { json.decodeFromString<AppSettings>(it) }.getOrNull() }
            ?: AppSettings.DEFAULT
    }

    val miners: Flow<List<Miner>> = context.dataStore.data.map { prefs ->
        prefs[minersKey]?.let { runCatching { json.decodeFromString<List<Miner>>(it) }.getOrNull() }
            ?: emptyList()
    }

    suspend fun updateSettings(transform: (AppSettings) -> AppSettings) {
        context.dataStore.edit { prefs ->
            val current = prefs[settingsKey]?.let {
                runCatching { json.decodeFromString<AppSettings>(it) }.getOrNull()
            } ?: AppSettings.DEFAULT
            prefs[settingsKey] = json.encodeToString(transform(current))
        }
    }

    suspend fun saveMiners(miners: List<Miner>) {
        context.dataStore.edit { it[minersKey] = json.encodeToString(miners) }
    }
}
