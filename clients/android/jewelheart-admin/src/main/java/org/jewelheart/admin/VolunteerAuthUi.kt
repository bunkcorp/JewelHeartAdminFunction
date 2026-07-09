package org.jewelheart.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val InputGray = Color(0xFFE8EAED)
private val InputText = Color(0xFF1A1A1A)
private val PlaceholderGray = Color(0xFF666666)

@Composable
fun VolunteerAuthScaffold(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        VolunteerGoldHeaderBar("Jewel Heart Volunteers")
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            content = content,
        )
    }
}

@Composable
fun VolunteerGoldHeaderBar(text: String) {
    Box(
        Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 44.dp)
            .background(JewelHeartColors.Gold)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = Color.Black,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun VolunteerBlueBar(text: String, textColor: Color = Color.White) {
    Box(
        Modifier
            .widthIn(max = 320.dp)
            .fillMaxWidth()
            .defaultMinSize(minHeight = 44.dp)
            .background(JewelHeartColors.SummaryBlue)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = textColor,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            lineHeight = 20.sp,
        )
    }
}

@Composable
fun VolunteerMaroonButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
) {
    androidx.compose.material3.Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .padding(vertical = 4.dp)
            .shadow(4.dp, RoundedCornerShape(16.dp))
            .defaultMinSize(minHeight = 44.dp),
        shape = RoundedCornerShape(16.dp),
        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
            containerColor = JewelHeartColors.ActionMaroon,
            contentColor = Color.White,
            disabledContainerColor = JewelHeartColors.ActionMaroon.copy(alpha = 0.45f),
            disabledContentColor = Color.White.copy(alpha = 0.85f),
        ),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 8.dp),
    ) {
        Text(text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun VolunteerGrayTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = singleLine,
        textStyle = TextStyle(
            color = InputText,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Start,
        ),
        modifier = modifier
            .padding(vertical = 4.dp)
            .widthIn(max = 320.dp)
            .fillMaxWidth()
            .defaultMinSize(minHeight = 44.dp)
            .background(InputGray, RoundedCornerShape(0.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        decorationBox = { inner ->
            Box(Modifier.fillMaxWidth()) {
                if (value.isEmpty()) {
                    Text(
                        placeholder,
                        color = PlaceholderGray,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.align(Alignment.CenterStart),
                    )
                }
                inner()
            }
        },
    )
}

@Composable
fun VolunteerAuthMessage(text: String, isError: Boolean) {
    if (text.isBlank()) return
    Text(
        text,
        color = if (isError) JewelHeartColors.ErrorRed else Color(0xFF0D7A4A),
        fontSize = 15.sp,
        fontWeight = if (isError) FontWeight.Normal else FontWeight.Bold,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .widthIn(max = 320.dp)
            .padding(top = 6.dp),
        lineHeight = 20.sp,
    )
}
