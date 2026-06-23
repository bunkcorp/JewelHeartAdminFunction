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
    @SerializedName("metadata") val metadata: SduiScreenMetadata?,
)

data class SduiScreenMetadata(
    @SerializedName("stickyHeader") val stickyHeader: Boolean?,
    @SerializedName("stickyHeaderComponents") val stickyHeaderComponents: List<UiComponent>?,
    @SerializedName("stickyFooter") val stickyFooter: Boolean?,
    @SerializedName("stickyFooterComponents") val stickyFooterComponents: List<UiComponent>?,
    @SerializedName("homeSplitLayout") val homeSplitLayout: Boolean?,
    @SerializedName("layoutFlat") val layoutFlat: Boolean?,
    @SerializedName("buildStamp") val buildStamp: String?,
    @SerializedName("filterState") val filterState: SduiFilterState?,
)

data class SduiFilterState(
    @SerializedName("daysAll") val daysAll: String?,
    @SerializedName("selectedDays") val selectedDays: String?,
    @SerializedName("daysPrev") val daysPrev: String?,
    @SerializedName("jobsAll") val jobsAll: String?,
    @SerializedName("selectedJobs") val selectedJobs: String?,
    @SerializedName("jobsPrev") val jobsPrev: String?,
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
    @SerializedName("minHeight") val minHeight: DimensionSpec?,
    @SerializedName("width") val width: DimensionSpec?,
    @SerializedName("backgroundColor") val backgroundColor: String?,
    @SerializedName("borderColor") val borderColor: String?,
    @SerializedName("borderRadius") val borderRadius: Double?,
    @SerializedName("fullBleed") val fullBleed: Boolean?,
    @SerializedName("elevation") val elevation: Double?,
    @SerializedName("buttonVariant") val buttonVariant: String?,
    @SerializedName("equalWidthChildren") val equalWidthChildren: Boolean?,
    @SerializedName("parentCentered") val parentCentered: Boolean?,
    @SerializedName("flexGrow") val flexGrow: Boolean?,
    @SerializedName("wrapChildren") val wrapChildren: Boolean?,
    @SerializedName("multiline") val multiline: Boolean?,
    @SerializedName("navIcon") val navIcon: Boolean?,
    @SerializedName("instructionBarBleed") val instructionBarBleed: Boolean?,
    @SerializedName("maxHeight") val maxHeight: DimensionSpec?,
    @SerializedName("homeActionPill") val homeActionPill: Boolean?,
    @SerializedName("homeActionPillFullWidth") val homeActionPillFullWidth: Boolean?,
    @SerializedName("jobListFrame") val jobListFrame: Boolean?,
    @SerializedName("noWrap") val noWrap: Boolean?,
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
    @SerializedName("payload") val payload: Map<String, Any>?,
)

data class NavSnapshot(
    val screenId: String,
    val retreatId: String?,
    val extraParams: Map<String, String>,
)
