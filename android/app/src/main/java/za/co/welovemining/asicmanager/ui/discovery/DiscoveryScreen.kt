package za.co.welovemining.asicmanager.ui.discovery

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import za.co.welovemining.asicmanager.data.model.Miner
import za.co.welovemining.asicmanager.ui.theme.WlmOnSurfaceMuted
import za.co.welovemining.asicmanager.ui.theme.WlmOrange

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoveryScreen(
    viewModel: DiscoveryViewModel,
    initialSubnet: String,
    onAdd: (List<Miner>) -> Unit,
    onBack: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var subnet by remember { mutableStateOf(initialSubnet) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Discover miners") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(
                    start = 16.dp, end = 16.dp,
                    top = padding.calculateTopPadding() + 12.dp,
                    bottom = padding.calculateBottomPadding() + 12.dp,
                ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = subnet,
                onValueChange = { subnet = it },
                label = { Text("Subnet (CIDR)") },
                placeholder = { Text("192.168.1.0/24") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.scanning,
            )
            Button(
                onClick = { viewModel.scan(subnet) },
                enabled = !state.scanning && subnet.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = WlmOrange, contentColor = Color(0xFF1A1206)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.Radar, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(if (state.scanning) "Scanning…" else "Scan network")
            }

            if (state.scanning) {
                val progress = if (state.total > 0) state.done.toFloat() / state.total else 0f
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth(), color = WlmOrange)
                Text("Probing ${state.done} / ${state.total} hosts", style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
            }

            when {
                state.scanning && state.results.isEmpty() -> {
                    Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = WlmOrange)
                    }
                }
                !state.scanning && state.results.isEmpty() && state.total > 0 -> {
                    Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                        Text("No miners found on $subnet", color = WlmOnSurfaceMuted)
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(vertical = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(state.results, key = { it.host }) { d ->
                            val checked = d.host in state.selected
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(MaterialTheme.colorScheme.surface)
                                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
                                    .clickable { viewModel.toggle(d.host) }
                                    .padding(12.dp),
                            ) {
                                Icon(Icons.Filled.Memory, contentDescription = null, tint = WlmOrange, modifier = Modifier.size(20.dp))
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        d.host,
                                        fontFamily = FontFamily.Monospace,
                                        style = MaterialTheme.typography.titleMedium,
                                        color = MaterialTheme.colorScheme.onSurface,
                                    )
                                    Text(
                                        "${d.firmware.displayName}${if (d.model.isNotBlank()) " · ${d.model}" else ""} · :${d.port}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = WlmOnSurfaceMuted,
                                    )
                                }
                                Checkbox(checked = checked, onCheckedChange = { viewModel.toggle(d.host) })
                            }
                        }
                    }
                    if (state.selected.isNotEmpty()) {
                        Button(
                            onClick = { onAdd(viewModel.buildSelected()); onBack() },
                            colors = ButtonDefaults.buttonColors(containerColor = WlmOrange, contentColor = Color(0xFF1A1206)),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Add ${state.selected.size} miner(s)") }
                    }
                }
            }
        }
    }
}
