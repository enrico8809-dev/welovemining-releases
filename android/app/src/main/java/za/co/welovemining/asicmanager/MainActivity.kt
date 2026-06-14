package za.co.welovemining.asicmanager

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import za.co.welovemining.asicmanager.ui.WlmApp
import za.co.welovemining.asicmanager.ui.theme.WlmTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as WlmApplication).container
        setContent {
            WlmTheme {
                WlmApp(
                    repository = container.repository,
                    settingsStore = container.settingsStore,
                    discovery = container.discovery,
                )
            }
        }
    }
}
