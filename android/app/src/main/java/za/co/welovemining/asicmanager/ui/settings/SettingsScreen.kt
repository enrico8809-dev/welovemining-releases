package za.co.welovemining.asicmanager.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import za.co.welovemining.asicmanager.data.connection.ConnectionMode
import za.co.welovemining.asicmanager.ui.components.BrandMark
import za.co.welovemining.asicmanager.ui.theme.WlmOnSurfaceMuted
import za.co.welovemining.asicmanager.ui.theme.WlmOrange

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    contentPadding: PaddingValues,
) {
    val s by viewModel.settings.collectAsStateWithLifecycle()

    Column(
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(
                start = 16.dp, end = 16.dp,
                top = contentPadding.calculateTopPadding() + 12.dp,
                bottom = contentPadding.calculateBottomPadding() + 24.dp,
            ),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        BrandMark(Modifier.padding(vertical = 4.dp))

        SettingsGroup("Data source") {
            ToggleRow(
                title = "Demo mode",
                subtitle = "Show a simulated fleet. Turn off to connect to real miners.",
                checked = s.demoMode,
                onCheckedChange = viewModel::setDemoMode,
            )
        }

        SettingsGroup("Connectivity") {
            Text("Connection mode", style = MaterialTheme.typography.labelLarge, color = WlmOnSurfaceMuted)
            Spacer(Modifier.height(8.dp))
            val modes = ConnectionMode.entries
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                modes.forEachIndexed { i, mode ->
                    SegmentedButton(
                        selected = s.connectionMode == mode,
                        onClick = { viewModel.setConnectionMode(mode) },
                        shape = SegmentedButtonDefaults.itemShape(i, modes.size),
                    ) { Text(mode.name) }
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                when (s.connectionMode) {
                    ConnectionMode.AUTO -> "Direct on LAN, fall back to the Cloudflare tunnel when away."
                    ConnectionMode.LAN -> "Only talk to miners directly on the local network."
                    ConnectionMode.GATEWAY -> "Always go through the Cloudflare tunnel gateway."
                },
                style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted,
            )

            if (s.connectionMode != ConnectionMode.LAN) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = s.gatewayUrl,
                    onValueChange = viewModel::setGatewayUrl,
                    label = { Text("Gateway URL (Cloudflare tunnel)") },
                    placeholder = { Text("https://miners.welovemining.co.za") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = s.gatewayToken,
                    onValueChange = viewModel::setGatewayToken,
                    label = { Text("Access token") },
                    placeholder = { Text("Cloudflare Access service token / bearer") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (s.connectionMode != ConnectionMode.GATEWAY) {
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = s.lanSubnet,
                    onValueChange = viewModel::setLanSubnet,
                    label = { Text("LAN subnet (for discovery)") },
                    placeholder = { Text("192.168.1.0/24") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        SettingsGroup("Monitoring") {
            SliderRow(
                title = "Poll interval",
                valueLabel = "${s.pollIntervalSec}s",
                value = s.pollIntervalSec.toFloat(),
                range = 3f..60f,
                onChange = { viewModel.setPollInterval(it.toInt()) },
            )
            Spacer(Modifier.height(8.dp))
            SliderRow(
                title = "Temperature alert",
                valueLabel = "${s.tempWarnC}°C",
                value = s.tempWarnC.toFloat(),
                range = 60f..105f,
                onChange = { viewModel.setTempWarn(it.toInt()) },
            )
        }

        SettingsGroup("About") {
            InfoRow("App", "WLM ASIC Manager")
            InfoRow("Version", "1.0.0")
            InfoRow("Firmware support", "Braiins OS+, VNish, Avalon/CGMiner, Bitmain")
            InfoRow("Support", "enrico@welovemining.co.za")
        }
    }
}

@Composable
private fun SettingsGroup(title: String, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column {
        Text(title.uppercase(), style = MaterialTheme.typography.labelLarge, color = WlmOrange, modifier = Modifier.padding(bottom = 8.dp, start = 4.dp))
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
}

@Composable
private fun ToggleRow(title: String, subtitle: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun SliderRow(title: String, valueLabel: String, value: Float, range: ClosedFloatingPointRange<Float>, onChange: (Float) -> Unit) {
    Column {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(title, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(valueLabel, style = MaterialTheme.typography.labelLarge, color = WlmOrange)
        }
        Slider(value = value, onValueChange = onChange, valueRange = range)
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = WlmOnSurfaceMuted)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}
