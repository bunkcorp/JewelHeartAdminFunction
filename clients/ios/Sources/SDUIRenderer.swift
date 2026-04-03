import SwiftUI

struct SDUIRoot: View {
    let screen: SDUIScreen
    let onAction: (SDUIAction) async -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let title = screen.title {
                    Text(title)
                        .font(.title2)
                        .bold()
                        .padding(.bottom, 8)
                }
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
        if layout == "row" {
            HStack(alignment: .top, spacing: spacing) {
                childrenViews
            }
        } else {
            VStack(alignment: .leading, spacing: spacing) {
                childrenViews
            }
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

    private var textBody: some View {
        Text(component.content ?? "")
            .font(.system(size: component.textStyle?.fontSize ?? 16))
            .fontWeight(weight(from: component.textStyle?.fontWeight))
            .multilineTextAlignment(align(from: component.textStyle?.textAlign))
            .foregroundStyle(Color(hex: component.textStyle?.color) ?? .primary)
    }

    private var buttonBody: some View {
        Button {
            if let a = component.action {
                Task { await onAction(a) }
            }
        } label: {
            HStack {
                if let icon = component.icon {
                    Image(systemName: icon)
                }
                Text(component.label ?? component.content ?? "Button")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.borderedProminent)
        .padding(.top, 4)
    }

    private var spacerBody: some View {
        let h = component.style?.height?.value ?? 12
        Color.clear.frame(height: CGFloat(h))
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
