package za.co.welovemining.asicmanager.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import za.co.welovemining.asicmanager.data.model.MinerState
import za.co.welovemining.asicmanager.ui.theme.WlmDanger
import za.co.welovemining.asicmanager.ui.theme.WlmGood
import za.co.welovemining.asicmanager.ui.theme.WlmOnSurfaceMuted
import za.co.welovemining.asicmanager.ui.theme.WlmWarn

fun stateColor(state: MinerState): Color = when (state) {
    MinerState.ONLINE -> WlmGood
    MinerState.WARNING -> WlmWarn
    MinerState.ERROR -> WlmDanger
    MinerState.OFFLINE -> WlmOnSurfaceMuted
}

fun stateLabel(state: MinerState): String = when (state) {
    MinerState.ONLINE -> "ONLINE"
    MinerState.WARNING -> "WARNING"
    MinerState.ERROR -> "ERROR"
    MinerState.OFFLINE -> "OFFLINE"
}

/** A small status chip: colored dot + label, used on every miner row/header. */
@Composable
fun StatusPill(state: MinerState, modifier: Modifier = Modifier) {
    val color = stateColor(state)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 10.dp, vertical = 5.dp),
    ) {
        Box(
            Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(color),
        )
        Text(
            text = stateLabel(state),
            style = MaterialTheme.typography.labelSmall,
            color = color,
            modifier = Modifier.padding(start = 6.dp),
        )
    }
}
