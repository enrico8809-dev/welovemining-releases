package za.co.welovemining.asicmanager.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import za.co.welovemining.asicmanager.data.connection.ActiveLink
import za.co.welovemining.asicmanager.data.model.FleetSummary
import za.co.welovemining.asicmanager.data.model.Miner
import za.co.welovemining.asicmanager.data.model.MinerWithStats
import za.co.welovemining.asicmanager.data.mock.MockData
import za.co.welovemining.asicmanager.data.repository.MinerRepository
import za.co.welovemining.asicmanager.data.settings.AppSettings
import za.co.welovemining.asicmanager.data.settings.SettingsStore

data class FleetUiState(
    val items: List<MinerWithStats> = emptyList(),
    val summary: FleetSummary = FleetSummary.EMPTY,
    val link: ActiveLink = ActiveLink.OFFLINE,
    val history: List<Double> = emptyList(),
    val loading: Boolean = true,
    val lastUpdatedMs: Long = 0,
    val lastError: String? = null,
)

/**
 * Activity-scoped owner of the live fleet. Runs a single poll loop on the
 * configured cadence, normalizes the result into [FleetUiState], and keeps a
 * rolling history of total hashrate for the dashboard trend chart. Every screen
 * reads from this one source so the whole app stays in sync.
 */
class FleetViewModel(
    private val repository: MinerRepository,
    private val settingsStore: SettingsStore,
) : ViewModel() {

    private val _state = MutableStateFlow(FleetUiState())
    val state: StateFlow<FleetUiState> = _state.asStateFlow()

    val settings: StateFlow<AppSettings> = settingsStore.settings
        .stateIn(viewModelScope, SharingStarted.Eagerly, AppSettings.DEFAULT)

    private val configuredMiners: StateFlow<List<Miner>> = settingsStore.miners
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private val history = ArrayDeque<Double>()
    private val maxHistory = 60

    init {
        viewModelScope.launch {
            var tick = 0L
            while (true) {
                val s = settings.value
                poll(s, currentMiners(s), tick)
                tick++
                delay(s.pollIntervalSec.coerceAtLeast(3) * 1000L)
            }
        }
    }

    private fun currentMiners(s: AppSettings): List<Miner> =
        if (s.demoMode) MockData.miners else configuredMiners.value

    private suspend fun poll(s: AppSettings, miners: List<Miner>, tick: Long) {
        val result = runCatching { repository.pollFleet(s, miners, tick) }.getOrElse {
            _state.value = _state.value.copy(loading = false, lastError = it.message ?: "Poll failed")
            return
        }
        val summary = FleetSummary.from(result.items)
        pushHistory(summary.totalHashrateThs)
        _state.value = FleetUiState(
            items = result.items,
            summary = summary,
            link = result.link,
            history = history.toList(),
            loading = false,
            lastUpdatedMs = System.currentTimeMillis(),
            lastError = null,
        )
    }

    private fun pushHistory(value: Double) {
        history.addLast(value)
        while (history.size > maxHistory) history.removeFirst()
    }

    fun refresh() = viewModelScope.launch {
        val s = settings.value
        poll(s, currentMiners(s), System.currentTimeMillis() / 1000)
    }

    fun reboot(minerId: String) = viewModelScope.launch {
        val item = _state.value.items.firstOrNull { it.miner.id == minerId } ?: return@launch
        repository.reboot(settings.value, _state.value.link, item.miner)
    }

    fun locate(minerId: String, on: Boolean) = viewModelScope.launch {
        val item = _state.value.items.firstOrNull { it.miner.id == minerId } ?: return@launch
        repository.locate(settings.value, _state.value.link, item.miner, on)
    }

    fun itemFor(minerId: String): MinerWithStats? =
        _state.value.items.firstOrNull { it.miner.id == minerId }

    // --- fleet configuration (add / edit / delete) -------------------------

    fun configuredMinerFor(minerId: String): Miner? =
        configuredMiners.value.firstOrNull { it.id == minerId }

    /** Insert a new miner or replace the existing one with the same id. */
    fun saveMiner(miner: Miner) = viewModelScope.launch {
        val current = configuredMiners.value
        val isNew = current.none { it.id == miner.id }
        val updated = if (isNew) current + miner else current.map { if (it.id == miner.id) miner else it }
        settingsStore.saveMiners(updated)
        // Configuring a real miner means we're no longer browsing the demo fleet.
        if (isNew) settingsStore.updateSettings { it.copy(demoMode = false) }
        refresh()
    }

    fun deleteMiner(minerId: String) = viewModelScope.launch {
        settingsStore.saveMiners(configuredMiners.value.filterNot { it.id == minerId })
        refresh()
    }

    /** Merge discovered miners into the fleet, skipping hosts already present. */
    fun addDiscovered(miners: List<Miner>) = viewModelScope.launch {
        val current = configuredMiners.value
        val existingHosts = current.map { it.lanHost }.toSet()
        val additions = miners.filterNot { it.lanHost in existingHosts }
        if (additions.isNotEmpty()) {
            settingsStore.saveMiners(current + additions)
            // Adding real hardware implies leaving the demo fleet.
            settingsStore.updateSettings { it.copy(demoMode = false) }
            refresh()
        }
    }

    companion object {
        fun factory(repository: MinerRepository, settingsStore: SettingsStore) =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                    FleetViewModel(repository, settingsStore) as T
            }
    }
}
