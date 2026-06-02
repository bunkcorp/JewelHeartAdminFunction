package org.jewelheart.admin

import com.google.gson.annotations.SerializedName

data class SduiEnvelope(
    @SerializedName("schemaVersion") val schemaVersion: Int,
    @SerializedName("minAppVersion") val minAppVersion: String?,
    @SerializedName("screen") val screen: SduiScreen,
)

data class SduiScreen(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String?,
    @SerializedName("components") val components: List<UiComponent>?,
)

data class UiComponent(
    @SerializedName("type") val type: String,
    @SerializedName("layout") val layout: String?,
    @SerializedName("spacing") val spacing: Double?,
    @SerializedName("style") val style: ComponentStyle?,
    @SerializedName("content") val content: String?,
    @SerializedName("label") val label: String?,
    @SerializedName("icon") val icon: String?,
    @SerializedName("textStyle") val textStyle: TextStyle?,
    @SerializedName("children") val children: List<UiComponent>?,
    @SerializedName("action") val action: SduiAction?,
)

data class TextStyle(
    @SerializedName("fontSize") val fontSize: Double?,
    @SerializedName("fontWeight") val fontWeight: String?,
    @SerializedName("textAlign") val textAlign: String?,
    @SerializedName("color") val color: String?,
)

data class ComponentStyle(
    @SerializedName("padding") val padding: PaddingSpec?,
    @SerializedName("margin") val margin: MarginSpec?,
    @SerializedName("height") val height: DimensionSpec?,
    @SerializedName("backgroundColor") val backgroundColor: String?,
)

data class PaddingSpec(
    @SerializedName("all") val all: Double?,
    @SerializedName("top") val top: Double?,
    @SerializedName("bottom") val bottom: Double?,
    @SerializedName("left") val left: Double?,
    @SerializedName("right") val right: Double?,
)
data class MarginSpec(@SerializedName("top") val top: Double?)
data class DimensionSpec(@SerializedName("value") val value: Double?)

data class SduiAction(
    @SerializedName("type") val type: String,
    @SerializedName("target") val target: String?,
    @SerializedName("payload") val payload: Map<String, String>?,
)
