package za.co.welovemining.asicmanager.ui.miners

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import za.co.welovemining.asicmanager.data.model.MinerState
import za.co.welovemining.asicmanager.ui.FleetUiState
import za.co.welovemining.asicmanager.ui.components.MinerRow
import za.co.welovemining.asicmanager.ui.theme.WlmOnSurfaceMuted
import za.co.welovemining.asicmanager.ui.theme.WlmOrange

private enum class StatusFilter { ALL, ONLINE, ISSUES }

@Composable
fun MinersScreen(
    state: FleetUiState,
    onMinerClick: (String) -> Unit,
    onAddMiner: () -> Unit,
    onDiscover: () -> Unit,
    contentPadding: PaddingValues,
) {
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(StatusFilter.ALL) }

    val filtered = state.items.filter { item ->
        val matchesQuery = query.isBlank() ||
            item.miner.name.contains(query, true) ||
            item.miner.model.contains(query, true) ||
            item.miner.lanHost.contains(query, true) ||
            item.miner.groupName.contains(query, true)
        val st = item.stats?.state ?: MinerState.OFFLINE
        val matchesFilter = when (filter) {
            StatusFilter.ALL -> true
            StatusFilter.ONLINE -> st == MinerState.ONLINE
            StatusFilter.ISSUES -> st == MinerState.WARNING || st == MinerState.OFFLINE || st == MinerState.ERROR
        }
        matchesQuery && matchesFilter
    }
    val grouped = filtered.groupBy { it.miner.groupName }.toSortedMap()

    LazyColumn(
        contentPadding = PaddingValues(
            start = 16.dp, end = 16.dp,
            top = contentPadding.calculateTopPadding() + 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onAddMiner,
                    colors = ButtonDefaults.buttonColors(containerColor = WlmOrange, contentColor = Color(0xFF1A1206)),
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp)); Text("Add miner")
                }
                OutlinedButton(onClick = onDiscover, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.Radar, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp)); Text("Scan")
                }
            }
        }
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                placeholder = { Text("Search miners, models, IPs…") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                keyboardActions = androidx.compose.foundation.text.KeyboardActions.Default,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = ImeAction.Search),
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = filter == StatusFilter.ALL, onClick = { filter = StatusFilter.ALL }, label = { Text("All") })
                FilterChip(selected = filter == StatusFilter.ONLINE, onClick = { filter = StatusFilter.ONLINE }, label = { Text("Online") })
                FilterChip(selected = filter == StatusFilter.ISSUES, onClick = { filter = StatusFilter.ISSUES }, label = { Text("Issues") })
            }
        }

        grouped.forEach { (group, items) ->
            item(key = "group-$group") {
                Text(
                    "$group · ${items.size}".uppercase(),
                    style = MaterialTheme.typography.labelLarge,
                    color = WlmOnSurfaceMuted,
                    modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
                )
            }
            items(items, key = { it.miner.id }) { item ->
                MinerRow(item = item, onClick = { onMinerClick(item.miner.id) })
            }
        }

        if (filtered.isEmpty()) {
            item {
                Text(
                    "No miners match your filter.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = WlmOnSurfaceMuted,
                    modifier = Modifier.padding(24.dp),
                )
            }
        }
    }
}
