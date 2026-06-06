package za.co.welovemining.asicmanager.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import za.co.welovemining.asicmanager.data.model.CoolingType
import za.co.welovemining.asicmanager.data.model.MinerState
import za.co.welovemining.asicmanager.data.model.MinerWithStats
import za.co.welovemining.asicmanager.ui.theme.WlmOrange
import za.co.welovemining.asicmanager.ui.theme.WlmPower
import za.co.welovemining.asicmanager.ui.theme.WlmWater

@Composable
fun MinerRow(
    item: MinerWithStats,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val stats = item.stats
    val state = stats?.state ?: MinerState.OFFLINE
    val accent = stateColor(state)

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        // accent status bar
        Box(
            Modifier
                .width(4.dp)
                .height(46.dp)
                .clip(RoundedCornerShape(50))
                .background(accent),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(item.miner.name, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                if (item.miner.cooling == CoolingType.HYDRO) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.Outlined.WaterDrop, contentDescription = "Hydro", tint = WlmWater, modifier = Modifier.size(14.dp))
                }
            }
            Spacer(Modifier.height(2.dp))
            Text(
                "${item.miner.model} · ${item.miner.firmware.displayName}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                MetricChip(Icons.Filled.Speed, Format.hashrate(stats?.hashrateThs ?: 0.0), WlmOrange)
                MetricChip(Icons.Filled.Bolt, Format.power(stats?.powerW ?: 0.0), WlmPower)
                MetricChip(
                    if (item.miner.cooling == CoolingType.HYDRO) Icons.Outlined.WaterDrop else Icons.Outlined.Thermostat,
                    if (item.miner.cooling == CoolingType.HYDRO && stats?.hydro != null)
                        "${Format.temp(stats.hydro.inletTempC)}→${Format.temp(stats.hydro.outletTempC)}"
                    else Format.temp(stats?.maxTempC ?: 0.0),
                    tempColor(stats?.maxTempC ?: 0.0),
                )
            }
        }
        StatusPill(state)
    }
}

@Composable
private fun MetricChip(icon: ImageVector, text: String, tint: androidx.compose.ui.graphics.Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(4.dp))
        Text(
            text,
            style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}
