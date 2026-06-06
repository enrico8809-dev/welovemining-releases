package za.co.welovemining.asicmanager.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.ui.Modifier
import androidx.compose.runtime.Composable
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * A smooth area + line trend chart drawn entirely on a Canvas (no chart
 * library). Auto-scales to the data range with a little headroom so the line
 * breathes rather than clipping at the edges.
 */
@Composable
fun TrendChart(
    values: List<Double>,
    modifier: Modifier = Modifier,
    lineColor: Color = Color(0xFFF7931A),
) {
    Canvas(modifier = modifier) {
        if (values.size < 2) return@Canvas
        val min = values.min()
        val max = values.max()
        val range = (max - min).takeIf { it > 0 } ?: 1.0
        val pad = range * 0.15
        val lo = min - pad
        val span = (max + pad) - lo

        val stepX = size.width / (values.size - 1)
        fun pointAt(i: Int): Offset {
            val x = stepX * i
            val norm = ((values[i] - lo) / span).toFloat().coerceIn(0f, 1f)
            val y = size.height * (1f - norm)
            return Offset(x, y)
        }

        val points = values.indices.map { pointAt(it) }

        // baseline grid
        val grid = lineColor.copy(alpha = 0.06f)
        for (g in 1..3) {
            val y = size.height * g / 4f
            drawLine(grid, Offset(0f, y), Offset(size.width, y), strokeWidth = 1f)
        }

        val linePath = smoothPath(points)
        val fillPath = Path().apply {
            addPath(linePath)
            lineTo(size.width, size.height)
            lineTo(0f, size.height)
            close()
        }
        drawPath(
            path = fillPath,
            brush = Brush.verticalGradient(
                colors = listOf(lineColor.copy(alpha = 0.28f), lineColor.copy(alpha = 0f)),
            ),
        )
        drawPath(
            path = linePath,
            color = lineColor,
            style = Stroke(width = 2.5.dp.toPx()),
        )
        // leading dot
        points.lastOrNull()?.let { p ->
            drawCircle(lineColor, radius = 3.5.dp.toPx(), center = p)
            drawCircle(lineColor.copy(alpha = 0.25f), radius = 7.dp.toPx(), center = p)
        }
    }
}

/** Catmull-Rom-ish smoothing for a pleasant curve through the points. */
private fun DrawScope.smoothPath(points: List<Offset>): Path {
    val path = Path()
    if (points.isEmpty()) return path
    path.moveTo(points.first().x, points.first().y)
    for (i in 1 until points.size) {
        val prev = points[i - 1]
        val cur = points[i]
        val midX = (prev.x + cur.x) / 2f
        path.cubicTo(midX, prev.y, midX, cur.y, cur.x, cur.y)
    }
    return path
}
