package za.co.welovemining.asicmanager.ui.editor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import za.co.welovemining.asicmanager.data.model.CoolingType
import za.co.welovemining.asicmanager.data.model.FirmwareType
import za.co.welovemining.asicmanager.data.model.Miner
import za.co.welovemining.asicmanager.ui.theme.WlmDanger
import za.co.welovemining.asicmanager.ui.theme.WlmOrange
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MinerEditorScreen(
    initial: Miner?,
    onSave: (Miner) -> Unit,
    onDelete: (String) -> Unit,
    onBack: () -> Unit,
) {
    val editing = initial != null
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var host by remember { mutableStateOf(initial?.lanHost ?: "") }
    var portText by remember { mutableStateOf(initial?.port?.toString() ?: "") }
    var model by remember { mutableStateOf(initial?.model ?: "") }
    var group by remember { mutableStateOf(initial?.groupName ?: "Default") }
    var username by remember { mutableStateOf(initial?.username ?: "root") }
    var password by remember { mutableStateOf(initial?.password ?: "") }
    var firmware by remember { mutableStateOf(initial?.firmware ?: FirmwareType.BRAIINS) }
    var cooling by remember { mutableStateOf(initial?.cooling ?: CoolingType.AIR) }
    var fwExpanded by remember { mutableStateOf(false) }

    val canSave = name.isNotBlank() && host.isNotBlank()

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(if (editing) "Edit miner" else "Add miner") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (editing) {
                        IconButton(onClick = { onDelete(initial!!.id); onBack() }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = WlmDanger)
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
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(
                    start = 16.dp, end = 16.dp,
                    top = padding.calculateTopPadding() + 12.dp,
                    bottom = padding.calculateBottomPadding() + 24.dp,
                ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = name, onValueChange = { name = it },
                label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = host, onValueChange = { host = it },
                label = { Text("IP / hostname") }, placeholder = { Text("192.168.1.50") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = portText, onValueChange = { portText = it.filter(Char::isDigit) },
                label = { Text("API port (optional)") },
                placeholder = { Text("Braiins/Avalon 4028 · VNish 80") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )

            // Firmware dropdown
            ExposedDropdownMenuBox(expanded = fwExpanded, onExpandedChange = { fwExpanded = it }) {
                OutlinedTextField(
                    value = firmware.displayName,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Firmware") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = fwExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                androidx.compose.material3.ExposedDropdownMenu(
                    expanded = fwExpanded,
                    onDismissRequest = { fwExpanded = false },
                ) {
                    FirmwareType.entries.filter { it != FirmwareType.UNKNOWN }.forEach { fw ->
                        DropdownMenuItem(
                            text = { Text(fw.displayName) },
                            onClick = { firmware = fw; fwExpanded = false },
                        )
                    }
                }
            }

            // Cooling segmented control
            Text("Cooling", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                CoolingType.entries.forEachIndexed { i, c ->
                    SegmentedButton(
                        selected = cooling == c,
                        onClick = { cooling = c },
                        shape = SegmentedButtonDefaults.itemShape(i, CoolingType.entries.size),
                    ) { Text(c.displayName) }
                }
            }

            OutlinedTextField(
                value = model, onValueChange = { model = it },
                label = { Text("Model (optional)") }, placeholder = { Text("Antminer S21 Hydro") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = group, onValueChange = { group = it },
                label = { Text("Group") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = username, onValueChange = { username = it },
                    label = { Text("Username") }, singleLine = true, modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = password, onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true, modifier = Modifier.weight(1f),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Password),
                )
            }

            Spacer(Modifier.height(4.dp))
            Button(
                onClick = {
                    onSave(
                        Miner(
                            id = initial?.id ?: UUID.randomUUID().toString(),
                            name = name.trim(),
                            lanHost = host.trim(),
                            port = portText.toIntOrNull(),
                            model = model.trim(),
                            firmware = firmware,
                            cooling = cooling,
                            username = username.trim().ifBlank { "root" },
                            password = password,
                            groupName = group.trim().ifBlank { "Default" },
                        )
                    )
                    onBack()
                },
                enabled = canSave,
                colors = ButtonDefaults.buttonColors(containerColor = WlmOrange, contentColor = Color(0xFF1A1206)),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (editing) "Save changes" else "Add miner") }

            TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Cancel") }
        }
    }
}
