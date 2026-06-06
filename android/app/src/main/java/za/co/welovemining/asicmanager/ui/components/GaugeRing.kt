package za.co.welovemining.asicmanager.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * A 270° arc gauge with an animated sweep. Used for temperature and other
 * 0..max readings on the dashboard and detail screen.
 */
@Composable
fun GaugeRing(
    value: Float,
    max: Float,
    color: Color,
    label: String,
    centerText: String,
    modifier: Modifier = Modifier,
    sizeDp: Int = 96,
    trackColor: Color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
) {
    val fraction = (value / max).coerceIn(0f, 1f)
    val animated by animateFloatAsState(targetValue = fraction, label = "gauge")
    val startAngle = 135f
    val sweepMax = 270f

    Box(contentAlignment = Alignment.Center, modifier = modifier.size(sizeDp.dp)) {
        Canvas(Modifier.size(sizeDp.dp)) {
            val stroke = Stroke(width = 8.dp.toPx(), cap = StrokeCap.Round)
            val inset = 8.dp.toPx()
            val arcSize = Size(size.width - inset, size.height - inset)
            val topLeft = androidx.compose.ui.geometry.Offset(inset / 2, inset / 2)
            drawArc(
                color = trackColor,
                startAngle = startAngle,
                sweepAngle = sweepMax,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = stroke,
            )
            drawArc(
                color = color,
                startAngle = startAngle,
                sweepAngle = sweepMax * animated,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = stroke,
            )
        }
        Box(contentAlignment = Alignment.Center) {
            androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(centerText, style = MaterialTheme.typography.titleLarge, color = color)
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Pick a heat color ramp for a temperature in °C. */
fun tempColor(c: Double): Color = when {
    c >= 90 -> Color(0xFFF87171)
    c >= 80 -> Color(0xFFFBBF24)
    c >= 45 -> Color(0xFF34D399)
    else -> Color(0xFF38BDF8)
}
