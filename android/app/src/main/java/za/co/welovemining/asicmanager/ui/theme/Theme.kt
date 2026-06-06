package za.co.welovemining.asicmanager.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val WlmColorScheme = darkColorScheme(
    primary = WlmOrange,
    onPrimary = Color(0xFF1A1206),
    primaryContainer = WlmOrangeDim,
    onPrimaryContainer = WlmOrangeBright,
    secondary = WlmWater,
    onSecondary = Color(0xFF04212F),
    tertiary = WlmGood,
    onTertiary = Color(0xFF052016),
    background = WlmBackground,
    onBackground = WlmOnSurface,
    surface = WlmSurface,
    onSurface = WlmOnSurface,
    surfaceVariant = WlmSurfaceElevated,
    onSurfaceVariant = WlmOnSurfaceMuted,
    outline = WlmSurfaceOutline,
    outlineVariant = WlmSurfaceOutline,
    error = WlmDanger,
    onError = Color(0xFF2A0A0A),
)

@Composable
fun WlmTheme(
    @Suppress("UNUSED_PARAMETER") darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    // The app is dark-only by brand intent.
    val colorScheme = WlmColorScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = WlmBackground.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = WlmTypography,
        content = content,
    )
}
