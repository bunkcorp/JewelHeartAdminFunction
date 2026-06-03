import SwiftUI

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
            .padding()
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
                HStack(alignment: .top, spacing: spacing) {
                    childrenViews
                }
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
            .frame(maxWidth: .infinity, alignment: frameAlignment(from: textAlign))
        let bar: some View = Group {
            if let bg = barBackground(from: component.style) {
                label
                    .padding(barPadding(from: component.style))
                    .frame(maxWidth: .infinity)
                    .background(bg)
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
        .padding(barPadding(from: component.style))
        .background(bg ?? Color.clear, in: RoundedRectangle(cornerRadius: 8))

        let pill = buttonLabel.fixedSize(horizontal: true, vertical: false)

        return HStack {
            Spacer(minLength: 0)
            Button {
                if let a = component.action {
                    Task { await onAction(a) }
                }
            } label: {
                if centered {
                    pill
                } else {
                    buttonLabel
                        .frame(maxWidth: .infinity, alignment: frameAlignment(from: textAlign))
                }
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
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
