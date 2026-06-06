package za.co.welovemining.asicmanager.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Lan
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import za.co.welovemining.asicmanager.data.connection.ActiveLink
import za.co.welovemining.asicmanager.data.model.FleetSummary
import za.co.welovemining.asicmanager.ui.FleetUiState
import za.co.welovemining.asicmanager.ui.components.BrandMark
import za.co.welovemining.asicmanager.ui.components.Format
import za.co.welovemining.asicmanager.ui.components.MinerRow
import za.co.welovemining.asicmanager.ui.components.StatCard
import za.co.welovemining.asicmanager.ui.components.TrendChart
import za.co.welovemining.asicmanager.ui.theme.WlmGood
import za.co.welovemining.asicmanager.ui.theme.WlmOnSurfaceMuted
import za.co.welovemining.asicmanager.ui.theme.WlmOrange
import za.co.welovemining.asicmanager.ui.theme.WlmPower
import za.co.welovemining.asicmanager.ui.theme.WlmWarn
import za.co.welovemining.asicmanager.ui.theme.WlmWater

@Composable
fun DashboardScreen(
    state: FleetUiState,
    onRefresh: () -> Unit,
    onMinerClick: (String) -> Unit,
    contentPadding: PaddingValues,
) {
    val s = state.summary
    LazyColumn(
        contentPadding = PaddingValues(
            start = 16.dp, end = 16.dp,
            top = contentPadding.calculateTopPadding() + 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BrandMark()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ConnectionChip(state.link)
                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Filled.Refresh, "Refresh", tint = WlmOnSurfaceMuted)
                    }
                }
            }
        }

        item { SectionLabel("Fleet overview") }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard(
                    label = "Total hashrate",
                    value = Format.hashrateValue(s.totalHashrateThs).first,
                    unit = Format.hashrateValue(s.totalHashrateThs).second,
                    icon = Icons.Filled.Speed,
                    accent = WlmOrange,
                    sub = "${s.onlineMiners}/${s.totalMiners} online",
                    modifier = Modifier.weight(1f),
                )
                StatCard(
                    label = "Power draw",
                    value = Format.power(s.totalPowerW).substringBefore(' '),
                    unit = Format.power(s.totalPowerW).substringAfter(' '),
                    icon = Icons.Filled.Bolt,
                    accent = WlmPower,
                    sub = Format.efficiency(s.avgEfficiencyJTh),
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard(
                    label = "Hottest miner",
                    value = Format.temp(s.maxTempC),
                    unit = "C",
                    icon = Icons.Outlined.Thermostat,
                    accent = if (s.maxTempC >= 85) WlmWarn else WlmGood,
                    sub = "avg ${Format.temp(s.avgTempC)}",
                    modifier = Modifier.weight(1f),
                )
                StatCard(
                    label = "Coolant Δ",
                    value = s.avgCoolantDeltaC?.let { Format.temp(it) } ?: "—",
                    unit = if (s.avgCoolantDeltaC != null) "C" else null,
                    icon = Icons.Outlined.WaterDrop,
                    accent = WlmWater,
                    sub = "${s.hydroMiners} hydro units",
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item { TrendCard(state.history) }

        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                SectionLabel("Miners")
                Text("${state.items.size}", style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
            }
        }

        items(state.items, key = { it.miner.id }) { item ->
            MinerRow(item = item, onClick = { onMinerClick(item.miner.id) })
        }

        if (state.lastError != null) {
            item {
                Text(
                    "Last poll: ${state.lastError}",
                    style = MaterialTheme.typography.labelSmall,
                    color = WlmWarn,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelLarge,
        color = WlmOnSurfaceMuted,
        modifier = Modifier.padding(top = 6.dp, bottom = 2.dp),
    )
}

@Composable
private fun TrendCard(history: List<Double>) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.6f), RoundedCornerShape(18.dp))
            .padding(16.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("FLEET HASHRATE", style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
            Text(
                if (history.isNotEmpty()) Format.hashrate(history.last()) else "—",
                style = MaterialTheme.typography.titleMedium,
                color = WlmOrange,
            )
        }
        Spacer(Modifier.height(12.dp))
        TrendChart(
            values = history,
            modifier = Modifier.fillMaxWidth().height(120.dp),
            lineColor = WlmOrange,
        )
    }
}

@Composable
private fun ConnectionChip(link: ActiveLink) {
    val (icon: ImageVector, label: String, color: Color) = when (link) {
        ActiveLink.LAN -> Triple(Icons.Filled.Lan, "LAN", WlmGood)
        ActiveLink.GATEWAY -> Triple(Icons.Filled.CloudDone, "TUNNEL", WlmWater)
        ActiveLink.OFFLINE -> Triple(Icons.Outlined.CloudOff, "OFFLINE", WlmOnSurfaceMuted)
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(color))
        Spacer(Modifier.size(6.dp))
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
        Spacer(Modifier.size(4.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = color)
    }
}
