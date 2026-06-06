package za.co.welovemining.asicmanager.ui

import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import za.co.welovemining.asicmanager.data.repository.MinerRepository
import za.co.welovemining.asicmanager.data.settings.SettingsStore
import za.co.welovemining.asicmanager.ui.alerts.AlertsScreen
import za.co.welovemining.asicmanager.ui.dashboard.DashboardScreen
import za.co.welovemining.asicmanager.ui.minerdetail.MinerDetailScreen
import za.co.welovemining.asicmanager.ui.miners.MinersScreen
import za.co.welovemining.asicmanager.ui.navigation.Routes
import za.co.welovemining.asicmanager.ui.navigation.TopDestination
import za.co.welovemining.asicmanager.ui.settings.SettingsScreen
import za.co.welovemining.asicmanager.ui.settings.SettingsViewModel
import za.co.welovemining.asicmanager.ui.theme.WlmOrange

@Composable
fun WlmApp(repository: MinerRepository, settingsStore: SettingsStore) {
    val navController = rememberNavController()
    val fleetVm: FleetViewModel = viewModel(factory = FleetViewModel.factory(repository, settingsStore))
    val settingsVm: SettingsViewModel = viewModel(factory = SettingsViewModel.factory(settingsStore))

    val fleetState by fleetVm.state.collectAsStateWithLifecycle()
    val appSettings by settingsVm.settings.collectAsStateWithLifecycle()

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = currentRoute in TopDestination.entries.map { it.route }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    TopDestination.entries.forEach { dest ->
                        val selected = backStackEntry?.destination?.hierarchy?.any { it.route == dest.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(dest.route) {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(dest.icon, contentDescription = dest.label) },
                            label = { Text(dest.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = WlmOrange,
                                selectedTextColor = WlmOrange,
                                indicatorColor = WlmOrange.copy(alpha = 0.14f),
                                unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = TopDestination.DASHBOARD.route,
        ) {
            composable(TopDestination.DASHBOARD.route) {
                DashboardScreen(
                    state = fleetState,
                    onRefresh = fleetVm::refresh,
                    onMinerClick = { navController.navigate(Routes.minerDetail(it)) },
                    contentPadding = padding,
                )
            }
            composable(TopDestination.MINERS.route) {
                MinersScreen(
                    state = fleetState,
                    onMinerClick = { navController.navigate(Routes.minerDetail(it)) },
                    contentPadding = padding,
                )
            }
            composable(TopDestination.ALERTS.route) {
                AlertsScreen(
                    state = fleetState,
                    tempWarnC = appSettings.tempWarnC,
                    onMinerClick = { navController.navigate(Routes.minerDetail(it)) },
                    contentPadding = padding,
                )
            }
            composable(TopDestination.SETTINGS.route) {
                SettingsScreen(viewModel = settingsVm, contentPadding = padding)
            }
            composable(Routes.MINER_DETAIL) { entry ->
                val minerId = entry.arguments?.getString("minerId").orEmpty()
                MinerDetailScreen(
                    item = fleetState.items.firstOrNull { it.miner.id == minerId },
                    onBack = { navController.popBackStack() },
                    onReboot = { fleetVm.reboot(minerId) },
                    onLocate = { on -> fleetVm.locate(minerId, on) },
                )
            }
        }
    }
}
