package org.jewelheart.admin

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val JewelHeartLightColors = lightColorScheme(
    primary = JewelHeartColors.Gold,
    onPrimary = Color.Black,
    primaryContainer = JewelHeartColors.Gold.copy(alpha = 0.35f),
    onPrimaryContainer = Color.Black,
    secondary = JewelHeartColors.SummaryBlue,
    onSecondary = Color.White,
    secondaryContainer = JewelHeartColors.SummaryBlue.copy(alpha = 0.25f),
    onSecondaryContainer = Color(0xFF1A2A4A),
    tertiary = JewelHeartColors.ActionMaroon,
    onTertiary = Color.White,
)

@Composable
fun JewelHeartTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = JewelHeartLightColors,
        content = content,
    )
}
