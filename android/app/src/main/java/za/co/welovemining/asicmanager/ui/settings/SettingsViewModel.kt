package za.co.welovemining.asicmanager.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import za.co.welovemining.asicmanager.data.connection.ConnectionMode
import za.co.welovemining.asicmanager.data.settings.AppSettings
import za.co.welovemining.asicmanager.data.settings.SettingsStore

/** Reads and writes [AppSettings]. */
class SettingsViewModel(
    private val store: SettingsStore,
) : ViewModel() {

    val settings: StateFlow<AppSettings> = store.settings
        .stateIn(viewModelScope, SharingStarted.Eagerly, AppSettings.DEFAULT)

    fun setDemoMode(on: Boolean) = update { it.copy(demoMode = on) }
    fun setConnectionMode(mode: ConnectionMode) = update { it.copy(connectionMode = mode) }
    fun setGatewayUrl(url: String) = update { it.copy(gatewayUrl = url.trim()) }
    fun setGatewayToken(token: String) = update { it.copy(gatewayToken = token.trim()) }
    fun setLanSubnet(subnet: String) = update { it.copy(lanSubnet = subnet.trim()) }
    fun setPollInterval(sec: Int) = update { it.copy(pollIntervalSec = sec.coerceIn(3, 120)) }
    fun setTempWarn(c: Int) = update { it.copy(tempWarnC = c.coerceIn(50, 110)) }

    private fun update(transform: (AppSettings) -> AppSettings) {
        viewModelScope.launch { store.updateSettings(transform) }
    }

    companion object {
        fun factory(store: SettingsStore) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                SettingsViewModel(store) as T
        }
    }
}
