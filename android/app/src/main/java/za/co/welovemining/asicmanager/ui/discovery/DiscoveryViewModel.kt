package za.co.welovemining.asicmanager.ui.discovery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import za.co.welovemining.asicmanager.data.discovery.DiscoveredMiner
import za.co.welovemining.asicmanager.data.discovery.MinerDiscovery
import za.co.welovemining.asicmanager.data.model.Miner
import java.util.UUID

data class DiscoveryUiState(
    val scanning: Boolean = false,
    val done: Int = 0,
    val total: Int = 0,
    val results: List<DiscoveredMiner> = emptyList(),
    val selected: Set<String> = emptySet(),
)

class DiscoveryViewModel(
    private val discovery: MinerDiscovery,
) : ViewModel() {

    private val _state = MutableStateFlow(DiscoveryUiState())
    val state: StateFlow<DiscoveryUiState> = _state.asStateFlow()

    private var job: Job? = null

    fun scan(cidr: String) {
        job?.cancel()
        _state.value = DiscoveryUiState(scanning = true)
        job = viewModelScope.launch {
            val found = discovery.scan(cidr) { done, total ->
                _state.update { it.copy(done = done, total = total) }
            }
            _state.update {
                it.copy(
                    scanning = false,
                    results = found.sortedBy { m -> m.host },
                    selected = found.map { m -> m.host }.toSet(),
                )
            }
        }
    }

    fun toggle(host: String) = _state.update {
        it.copy(selected = if (host in it.selected) it.selected - host else it.selected + host)
    }

    /** Build [Miner] records for the user's selected discoveries. */
    fun buildSelected(): List<Miner> = _state.value.results
        .filter { it.host in _state.value.selected }
        .map { d ->
            Miner(
                id = UUID.randomUUID().toString(),
                name = d.model.ifBlank { d.firmware.displayName } + " @ " + d.host,
                lanHost = d.host,
                port = d.port.takeIf { it != 4028 },
                model = d.model,
                firmware = d.firmware,
            )
        }

    override fun onCleared() {
        job?.cancel()
        super.onCleared()
    }

    companion object {
        fun factory(discovery: MinerDiscovery) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                DiscoveryViewModel(discovery) as T
        }
    }
}
