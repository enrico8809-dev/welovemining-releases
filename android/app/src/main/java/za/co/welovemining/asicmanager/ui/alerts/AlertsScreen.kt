package za.co.welovemining.asicmanager.ui.alerts

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import za.co.welovemining.asicmanager.data.model.MinerState
import za.co.welovemining.asicmanager.ui.FleetUiState
import za.co.welovemining.asicmanager.ui.components.Format
import za.co.welovemining.asicmanager.ui.theme.WlmDanger
import za.co.welovemining.asicmanager.ui.theme.WlmGood
import za.co.welovemining.asicmanager.ui.theme.WlmOnSurfaceMuted
import za.co.welovemining.asicmanager.ui.theme.WlmWarn

private data class Alert(
    val minerId: String,
    val title: String,
    val detail: String,
    val severity: Severity,
)

private enum class Severity(val color: Color, val icon: ImageVector) {
    CRITICAL(WlmDanger, Icons.Outlined.CloudOff),
    WARNING(WlmWarn, Icons.Outlined.Warning),
    HEAT(WlmWarn, Icons.Outlined.Thermostat),
}

@Composable
fun AlertsScreen(
    state: FleetUiState,
    tempWarnC: Int,
    onMinerClick: (String) -> Unit,
    contentPadding: PaddingValues,
) {
    val alerts = buildList {
        state.items.forEach { item ->
            val stats = item.stats
            val st = stats?.state ?: MinerState.OFFLINE
            when (st) {
                MinerState.OFFLINE, MinerState.ERROR -> add(
                    Alert(item.miner.id, "${item.miner.name} is offline",
                        stats?.errorMessage ?: "No response from miner", Severity.CRITICAL)
                )
                else -> Unit
            }
            if (stats != null && stats.maxTempC >= tempWarnC) {
                add(Alert(item.miner.id, "${item.miner.name} running hot",
                    "Hottest sensor at ${Format.temp(stats.maxTempC)} (limit ${tempWarnC}°)", Severity.HEAT))
            }
            if (stats != null && st == MinerState.WARNING && stats.maxTempC < tempWarnC) {
                add(Alert(item.miner.id, "${item.miner.name} degraded",
                    "Hashing below nominal", Severity.WARNING))
            }
        }
    }.sortedBy { it.severity.ordinal }

    if (alerts.isEmpty()) {
        Box(Modifier.fillMaxSize().padding(contentPadding), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = WlmGood, modifier = Modifier.size(48.dp))
                Spacer(Modifier.size(12.dp))
                Text("All systems nominal", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text("No active alerts across the fleet", style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
            }
        }
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(
            start = 16.dp, end = 16.dp,
            top = contentPadding.calculateTopPadding() + 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("ACTIVE ALERTS · ${alerts.size}", style = MaterialTheme.typography.labelLarge, color = WlmOnSurfaceMuted, modifier = Modifier.padding(vertical = 6.dp))
        }
        items(alerts) { alert ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(alert.severity.color.copy(alpha = 0.08f))
                    .border(1.dp, alert.severity.color.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                    .clickable { onMinerClick(alert.minerId) }
                    .padding(14.dp),
            ) {
                Box(
                    Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(alert.severity.color.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center,
                ) { Icon(alert.severity.icon, contentDescription = null, tint = alert.severity.color, modifier = Modifier.size(20.dp)) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(alert.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                    Text(alert.detail, style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
                }
            }
        }
    }
}
