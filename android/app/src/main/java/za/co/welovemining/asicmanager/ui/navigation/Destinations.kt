package za.co.welovemining.asicmanager.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector

/** Top-level tabs shown in the bottom navigation bar. */
enum class TopDestination(val route: String, val label: String, val icon: ImageVector) {
    DASHBOARD("dashboard", "Dashboard", Icons.Filled.Dashboard),
    MINERS("miners", "Miners", Icons.Filled.Memory),
    ALERTS("alerts", "Alerts", Icons.Filled.Notifications),
    SETTINGS("settings", "Settings", Icons.Filled.Settings),
}

object Routes {
    const val MINER_DETAIL = "miner/{minerId}"
    fun minerDetail(id: String) = "miner/$id"
}
