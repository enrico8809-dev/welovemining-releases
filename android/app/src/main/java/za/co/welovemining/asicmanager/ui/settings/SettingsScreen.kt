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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import za.co.welovemining.asicmanager.data.settings.Site
import za.co.welovemining.asicmanager.ui.components.BrandMark
import za.co.welovemining.asicmanager.ui.theme.WlmDanger
import za.co.welovemining.asicmanager.ui.theme.WlmOnSurfaceMuted
import za.co.welovemining.asicmanager.ui.theme.WlmOrange
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    contentPadding: PaddingValues,
) {
    val s by viewModel.settings.collectAsStateWithLifecycle()
    var editingSite by remember { mutableStateOf<Site?>(null) }

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

        SettingsGroup("My sites") {
            Text(
                "Each mining site runs the WLM Site Manager (Windows). Add a site with its address and access token from the Site Manager dashboard.",
                style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted,
            )
            Spacer(Modifier.height(10.dp))
            s.sites.forEach { site ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(site.name, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                        Text(site.url, style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted, maxLines = 1)
                    }
                    IconButton(onClick = { editingSite = site }) {
                        Icon(Icons.Filled.Edit, contentDescription = "Edit", tint = WlmOnSurfaceMuted)
                    }
                    IconButton(onClick = { viewModel.deleteSite(site.id) }) {
                        Icon(Icons.Filled.Delete, contentDescription = "Remove", tint = WlmDanger)
                    }
                }
            }
            if (s.sites.isEmpty()) {
                Text("No sites yet.", style = MaterialTheme.typography.bodyMedium, color = WlmOnSurfaceMuted)
                Spacer(Modifier.height(6.dp))
            }
            Button(
                onClick = { editingSite = Site(id = UUID.randomUUID().toString(), name = "", url = "") },
                colors = ButtonDefaults.buttonColors(containerColor = WlmOrange, contentColor = Color(0xFF1A1206)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp)); Text("Add site")
            }
        }

        if (s.sites.isEmpty()) {
            SettingsGroup("Direct LAN (advanced)") {
                Text("Without a Site Manager, the app can talk to miners directly on the same Wi-Fi.", style = MaterialTheme.typography.labelSmall, color = WlmOnSurfaceMuted)
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
            InfoRow("Version", "2.0.0")
            InfoRow("Firmware support", "Braiins OS+, VNish, Avalon/CGMiner, Bitmain")
            InfoRow("Support", "enrico@welovemining.co.za")
        }
    }

    editingSite?.let { site ->
        SiteEditorDialog(
            site = site,
            onSave = { viewModel.saveSite(it); editingSite = null },
            onDismiss = { editingSite = null },
        )
    }
}

@Composable
private fun SiteEditorDialog(site: Site, onSave: (Site) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(site.name) }
    var url by remember { mutableStateOf(site.url) }
    var token by remember { mutableStateOf(site.token) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (site.name.isBlank()) "Add site" else "Edit site") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Site name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text("Site address") }, placeholder = { Text("https://client1.welovemining.co.za") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = token, onValueChange = { token = it }, label = { Text("Access token") }, placeholder = { Text("From the Site Manager") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    var u = url.trim()
                    if (u.isNotBlank() && !u.startsWith("http")) u = "https://$u"
                    onSave(site.copy(name = name.trim().ifBlank { "Site" }, url = u.trimEnd('/'), token = token.trim()))
                },
                enabled = name.isNotBlank() && url.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = WlmOrange, contentColor = Color(0xFF1A1206)),
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        containerColor = MaterialTheme.colorScheme.surface,
    )
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
