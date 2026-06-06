import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct SDUIRoot: View {
    let screen: SDUIScreen
    let onAction: (SDUIAction) async -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // `screen.title` is shown in the parent `NavigationStack` only (avoids triple headings).
                if let roots = screen.components {
                    ForEach(Array(roots.enumerated()), id: \.offset) { _, c in
                        SDUIComponentView(component: c, onAction: onAction)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, screen.id == "jewelheart.home" ? 0 : 16)
            .padding(.vertical, screen.id == "jewelheart.home" ? 6 : 12)
        }
    }
}

struct SDUIComponentView: View {
    let component: UIComponent
    let onAction: (SDUIAction) async -> Void

    var body: some View {
        Group {
            switch component.type {
            case "container":
                containerBody
            case "text":
                textBody
            case "button":
                buttonBody
            case "spacer":
                spacerBody
            case "card":
                cardBody
            default:
                Text("[\(component.type)]").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var containerBody: some View {
        let layout = component.layout ?? "column"
        let spacing = CGFloat(component.spacing ?? 16)
        let inner: some View = Group {
            if layout == "row" {
                let equalWidth = component.style?.equalWidthChildren == true
                let rowAlign: HorizontalAlignment = (component.textStyle?.textAlign?.lowercased() == "left") ? .leading : .center
                HStack(alignment: .center, spacing: spacing) {
                    if let ch = component.children {
                        ForEach(Array(ch.enumerated()), id: \.offset) { _, child in
                            Group {
                                SDUIComponentView(component: child, onAction: onAction)
                            }
                            .frame(maxWidth: (equalWidth || child.style?.flexGrow == true) ? .infinity : nil)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: rowAlign == .leading ? .leading : .center)
            } else {
                VStack(alignment: barAlignment(from: component), spacing: spacing) {
                    childrenViews
                }
            }
        }
        if let bg = barBackground(from: component.style) {
            inner
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(barPadding(from: component.style))
                .background(bg)
        } else {
            inner
                .frame(maxWidth: .infinity, alignment: frameAlignment(from: component.textStyle?.textAlign))
        }
    }

    @ViewBuilder
    private var childrenViews: some View {
        if let ch = component.children {
            ForEach(Array(ch.enumerated()), id: \.offset) { _, c in
                SDUIComponentView(component: c, onAction: onAction)
            }
        }
    }

    @ViewBuilder
    private var textBody: some View {
        let textAlign = component.textStyle?.textAlign
        let label = Text(component.content ?? "")
            .font(.system(size: component.textStyle?.fontSize ?? 16))
            .fontWeight(weight(from: component.textStyle?.fontWeight))
            .multilineTextAlignment(align(from: textAlign))
            .foregroundStyle(Color(hex: component.textStyle?.color) ?? .primary)
            .lineLimit(1)
            .truncationMode(.tail)
            .frame(
                maxWidth: (barBackground(from: component.style) != nil
                    || component.style?.flexGrow == true
                    || component.style?.parentCentered == true) ? .infinity : nil,
                alignment: frameAlignment(from: textAlign)
            )
        let fixedBarH = CGFloat(component.style?.height?.value ?? 0)
        let bar: some View = Group {
            if let bg = barBackground(from: component.style) {
                if fixedBarH > 0 {
                    let hPad = barPadding(from: component.style)
                    let fixedW = component.style?.width?.value
                    label
                        .padding(EdgeInsets(top: 0, leading: hPad.leading, bottom: 0, trailing: hPad.trailing))
                        .frame(
                            minWidth: fixedW != nil ? CGFloat(fixedW!) : nil,
                            maxWidth: fixedW != nil ? CGFloat(fixedW!) : .infinity,
                            minHeight: fixedBarH,
                            maxHeight: fixedBarH
                        )
                        .background(bg)
                } else {
                    label
                        .padding(barPadding(from: component.style))
                        .frame(maxWidth: .infinity)
                        .background(bg)
                }
            } else {
                label
            }
        }
        if let action = component.action {
            Button {
                Task { await onAction(action) }
            } label: {
                bar
            }
            .buttonStyle(.plain)
        } else {
            bar
        }
    }

    private var buttonBody: some View {
        let title = component.label ?? component.content ?? "Button"
        let textAlign = component.textStyle?.textAlign
        let centered = textAlign?.lowercased() == "center"
        let label = Text(title)
            .font(.system(size: component.textStyle?.fontSize ?? 16))
            .fontWeight(weight(from: component.textStyle?.fontWeight))
            .foregroundStyle(Color(hex: component.textStyle?.color) ?? .white)
            .multilineTextAlignment(align(from: textAlign))
            .lineLimit(1)
            .truncationMode(.tail)
        let bg = barBackground(from: component.style)
        let buttonLabel = Group {
            if let icon = component.icon {
                HStack(spacing: 8) {
                    Image(systemName: icon)
                    label
                }
            } else {
                label
            }
        }
        let fixedBtnH = CGFloat(component.style?.height?.value ?? 0)
        let hPad = barPadding(from: component.style)
        let pillCore = buttonLabel
            .padding(EdgeInsets(top: 0, leading: hPad.leading, bottom: 0, trailing: hPad.trailing))
            .frame(
                minWidth: 0,
                minHeight: fixedBtnH > 0 ? fixedBtnH : nil,
                maxHeight: fixedBtnH > 0 ? fixedBtnH : nil
            )
            .background {
                if let bg {
                    raisedButtonBackground(bg, style: component.style)
                }
            }

        let pill = pillCore.fixedSize(horizontal: true, vertical: false)
        let parentCentered = component.style?.parentCentered == true

        let tapButton = Button {
            if let a = component.action {
                Task { await onAction(a) }
            }
        } label: {
            if centered {
                pill
            } else {
                pill
            }
        }
        .buttonStyle(.plain)

        if parentCentered {
            return HStack {
                Spacer(minLength: 0)
                tapButton
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)
        }
        return tapButton
    }

    private var spacerBody: some View {
        Color.clear.frame(height: CGFloat(component.style?.height?.value ?? 12))
    }

    private var cardBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            childrenViews
        }
        .padding(cardPadding)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
    }

    private var cardPadding: CGFloat {
        CGFloat(component.style?.padding?.all ?? 12)
    }

    private func weight(from w: String?) -> Font.Weight {
        switch w?.lowercased() {
        case "bold": return .bold
        case "semibold": return .semibold
        default: return .regular
        }
    }

    private func align(from a: String?) -> TextAlignment {
        switch a {
        case "center": return .center
        case "trailing", "right": return .trailing
        default: return .leading
        }
    }

    private func frameAlignment(from a: String?) -> Alignment {
        switch a {
        case "center": return .center
        case "trailing", "right": return .trailing
        default: return .leading
        }
    }

    private func barBackground(from style: ComponentStyle?) -> Color? {
        guard let hex = style?.backgroundColor else { return nil }
        return Color(hex: hex)
    }

    private func barCornerRadius(from style: ComponentStyle?) -> CGFloat {
        CGFloat(style?.borderRadius ?? 8)
    }

    private func barPadding(from style: ComponentStyle?) -> EdgeInsets {
        let p = style?.padding
        return EdgeInsets(
            top: CGFloat(p?.top ?? p?.all ?? 10),
            leading: CGFloat(p?.left ?? p?.all ?? 8),
            bottom: CGFloat(p?.bottom ?? p?.all ?? 10),
            trailing: CGFloat(p?.right ?? p?.all ?? 8)
        )
    }

    private func barAlignment(from component: UIComponent) -> HorizontalAlignment {
        switch component.textStyle?.textAlign ?? component.children?.first?.textStyle?.textAlign {
        case "center": return .center
        case "trailing", "right": return .trailing
        default: return .leading
        }
    }

    @ViewBuilder
    private func raisedButtonBackground(_ bg: Color, style: ComponentStyle?) -> some View {
        let radius = barCornerRadius(from: style)
        let raised = style?.buttonVariant == "raised"
        let shape = RoundedRectangle(cornerRadius: radius)
        if raised {
            shape
                .fill(bg)
                .shadow(color: .black.opacity(0.42), radius: 5, x: 0, y: 4)
                .overlay(shape.stroke(sduiShadeColor(bg, by: 0.32), lineWidth: 2))
        } else {
            shape.fill(bg)
        }
    }

    private func sduiShadeColor(_ color: Color, by amount: CGFloat) -> Color {
        #if canImport(UIKit)
        let ui = UIColor(color)
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        let f = 1 - min(max(amount, 0), 0.45)
        return Color(red: r * f, green: g * f, blue: b * f, opacity: Double(a))
        #else
        return color
        #endif
    }
}

extension Color {
    init?(hex: String?) {
        guard let hex, hex.hasPrefix("#"), hex.count > 4 else { return nil }
        let s = String(hex.dropFirst())
        var n: UInt64 = 0
        guard Scanner(string: s).scanHexInt64(&n) else { return nil }
        let a, r, g, b: UInt64
        switch s.count {
        case 8:
            (a, r, g, b) = ((n & 0xFF00_0000) >> 24, (n & 0xFF_0000) >> 16, (n & 0xFF00) >> 8, n & 0xFF)
        case 6:
            (a, r, g, b) = (255, (n & 0xFF_0000) >> 16, (n & 0xFF00) >> 8, n & 0xFF)
        default:
            return nil
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
