package za.co.welovemining.asicmanager.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.welovemining.asicmanager.R
import za.co.welovemining.asicmanager.ui.theme.WlmOnSurfaceMuted
import za.co.welovemining.asicmanager.ui.theme.WlmOrange

/** Logo mark + "WLM ASIC MANAGER" wordmark for app bars and the empty state. */
@Composable
fun BrandMark(modifier: Modifier = Modifier, markSizeDp: Int = 34) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = modifier) {
        Image(
            painter = painterResource(R.mipmap.ic_wlm_logo),
            contentDescription = "WeLoveMining",
            modifier = Modifier.size(markSizeDp.dp),
        )
        Spacer(Modifier.width(6.dp))
        Column {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(color = WlmOrange, fontWeight = FontWeight.Black)) { append("WLM") }
                    withStyle(SpanStyle(color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)) { append(" ASIC") }
                },
                fontFamily = FontFamily.SansSerif,
                fontSize = 18.sp,
            )
            Text(
                "MANAGER",
                color = WlmOnSurfaceMuted,
                fontFamily = FontFamily.Monospace,
                fontSize = 9.sp,
                letterSpacing = 4.sp,
            )
        }
    }
}
