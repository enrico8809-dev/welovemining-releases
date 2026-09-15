package za.co.welovemining.asicmanager.ui.minerdetail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.outlined.Air
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.welovemining.asicmanager.data.model.BoardStat
import za.co.welovemining.asicmanager.data.model.CoolingType
import za.co.welovemining.asicmanager.data.model.MinerWithStats
import za.co.welovemining.asicmanager.data.model.PoolStat
import za.co.welovemining.asicmanager.ui.components.Format
import za.co.welovemining.asicmanager.ui.components.GaugeRing
import za.co.welovemining.asicmanager.ui.components.StatusPill
import za.co.welovemining.asicmanager.ui.components.tempColor
import za.co.welovemining.asicmanager.ui.theme.WlmGood
import za.co.welovemining.asicmanager.ui.theme.WlmOnSurfaceMuted
import za.co.welovemining.asicmanager.ui.theme.WlmOrange
import za.co.welovemining.asicmanager.ui.theme.WlmPower
import za.co.welovemining.asicmanager.ui.theme.WlmWater

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MinerDetailScreen(
    item: MinerWithStats?,
    onBack: () -> Unit,
    onReboot: () -> Unit,
    onLocate: (Boolean) -> Unit,
    onEdit: (() -> Unit)? = null,
    controllable: Boolean = true,
) {
    var confirmReboot by remember { mutableStateOf(false) }
    var locating by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(item?.miner?.name ?: "Miner", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (onEdit != null) {
                        IconButton(onClick = onEdit) {
                            Icon(Icons.Filled.Edit, contentDescription = "Edit")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
        },
    ) { padding ->
        if (item == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("Miner not found", color = WlmOnSurfaceMuted)
            }
            return@Scaffold
        }
        val stats = item.stats
        LazyColumn(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = 16.dp, end = 16.dp,
                top = padding.calculateTopPadding() + 8.dp,
                bottom = padding.calculateBottomPadding() + 24.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Header card
            item {
                Card {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text(item.miner.model, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                            Text(
                                "${item.miner.firmware.displayName} · ${item.miner.lanHost}",
                                style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted,
                            )
                        }
                        StatusPill(stats?.state ?: za.co.welovemining.asicmanager.data.model.MinerState.OFFLINE)
                    }
                    if (controllable) {
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { confirmReboot = true },
                                colors = ButtonDefaults.buttonColors(containerColor = WlmOrange, contentColor = Color(0xFF1A1206)),
                                modifier = Modifier.weight(1f),
                            ) {
                                Icon(Icons.Filled.RestartAlt, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp)); Text("Reboot")
                            }
                            OutlinedButton(
                                onClick = { locating = !locating; onLocate(locating) },
                                modifier = Modifier.weight(1f),
                            ) {
                                Icon(Icons.Filled.Lightbulb, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp)); Text(if (locating) "Locating…" else "Locate")
                            }
                        }
                    }
                }
            }

            // Primary readouts: hashrate + gauges
            item {
                Card {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            val (v, u) = Format.hashrateValue(stats?.hashrateThs ?: 0.0)
                            Text(v, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 30.sp, color = WlmOrange)
                            Text(u, style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
                            Text("HASHRATE", style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
                        }
                        GaugeRing(
                            value = (stats?.maxTempC ?: 0.0).toFloat(),
                            max = 110f,
                            color = tempColor(stats?.maxTempC ?: 0.0),
                            label = "TEMP",
                            centerText = Format.temp(stats?.maxTempC ?: 0.0),
                        )
                    }
                }
            }

            // Power / efficiency / uptime stat row
            item {
                Card {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        MiniStat("POWER", Format.power(stats?.powerW ?: 0.0), Icons.Outlined.Bolt, WlmPower)
                        MiniStat("EFFICIENCY", Format.efficiency(stats?.efficiencyJTh ?: 0.0), Icons.Filled.Speed, WlmOrange)
                        MiniStat("UPTIME", Format.uptime(stats?.uptimeSeconds ?: 0), Icons.Outlined.Memory, WlmGood)
                    }
                }
            }

            // Hydro loop
            if (item.miner.cooling == CoolingType.HYDRO && stats?.hydro != null) {
                item { HydroCard(stats.hydro) }
            }

            // Boards
            if (!stats?.boards.isNullOrEmpty()) {
                item { SectionTitle("Hashboards") }
                item {
                    Card {
                        stats!!.boards.forEachIndexed { i, b ->
                            BoardRow(b)
                            if (i < stats.boards.lastIndex) Spacer(Modifier.height(8.dp))
                        }
                    }
                }
            }

            // Fans
            if (!stats?.fanRpms.isNullOrEmpty()) {
                item {
                    Card {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Air, contentDescription = null, tint = WlmWater, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("FANS", style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            stats!!.fanRpms.forEachIndexed { i, rpm ->
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("$rpm", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                                    Text("fan ${i + 1}", style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
                                }
                            }
                        }
                    }
                }
            }

            // Pools
            if (!stats?.pools.isNullOrEmpty()) {
                item { SectionTitle("Pools") }
                stats!!.pools.forEach { pool ->
                    item(key = "pool-${pool.index}") { PoolCard(pool) }
                }
            }
        }
    }

    if (confirmReboot) {
        AlertDialog(
            onDismissRequest = { confirmReboot = false },
            title = { Text("Reboot ${item?.miner?.name}?") },
            text = { Text("The miner will stop hashing for 1–2 minutes while it restarts.") },
            confirmButton = {
                Button(
                    onClick = { confirmReboot = false; onReboot() },
                    colors = ButtonDefaults.buttonColors(containerColor = WlmOrange, contentColor = Color(0xFF1A1206)),
                ) { Text("Reboot") }
            },
            dismissButton = { TextButton(onClick = { confirmReboot = false }) { Text("Cancel") } },
            containerColor = MaterialTheme.colorScheme.surface,
        )
    }
}

@Composable
private fun Card(content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f), RoundedCornerShape(18.dp))
            .padding(16.dp),
        content = content,
    )
}

@Composable
private fun SectionTitle(text: String) {
    Text(text.uppercase(), style = MaterialTheme.typography.labelLarge, color = WlmOnSurfaceMuted)
}

@Composable
private fun MiniStat(label: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector, accent: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
        Spacer(Modifier.height(6.dp))
        Text(value, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        Text(label, style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
    }
}

@Composable
private fun HydroCard(hydro: za.co.welovemining.asicmanager.data.model.HydroStat) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(WlmWater.copy(alpha = 0.07f))
            .border(1.dp, WlmWater.copy(alpha = 0.3f), RoundedCornerShape(18.dp))
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.WaterDrop, contentDescription = null, tint = WlmWater, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("COOLANT LOOP", style = MaterialTheme.typography.labelSmall, color = WlmWater)
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            WaterStat("IN", Format.temp(hydro.inletTempC), WlmWater)
            WaterStat("OUT", Format.temp(hydro.outletTempC), WlmOrange)
            WaterStat("Δ", Format.temp(hydro.deltaTempC), WlmGood)
            WaterStat("FLOW", Format.flow(hydro.flowLpm), MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun WaterStat(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
    }
}

@Composable
private fun BoardRow(b: BoardStat) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text("Board ${b.index}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            BoardMetric(Format.hashrate(b.hashrateThs), WlmOrange)
            BoardMetric("${Format.temp(b.chipTempC)} chip", tempColor(b.chipTempC))
            if (b.chipsTotal > 0) BoardMetric("${b.chipsWorking}/${b.chipsTotal}", WlmGood)
        }
    }
}

@Composable
private fun BoardMetric(text: String, color: Color) {
    Text(text, fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = color)
}

@Composable
private fun PoolCard(pool: PoolStat) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("#${pool.index} ${pool.status}", style = MaterialTheme.typography.labelSmall, color = if (pool.status.equals("Alive", true)) WlmGood else WlmOnSurfaceMuted)
            Text("A:${pool.accepted} R:${pool.rejected}", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = WlmOnSurfaceMuted)
        }
        Spacer(Modifier.height(4.dp))
        Text(pool.url, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
        Text(pool.user, style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted, maxLines = 1)
    }
}
