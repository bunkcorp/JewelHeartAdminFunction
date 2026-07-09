import SwiftUI

enum JewelHeartAuthColors {
    static let gold = Color(hex: "#FFCA10") ?? .yellow
    static let summaryBlue = Color(hex: "#7A95CA") ?? .blue
    static let actionMaroon = Color(hex: "#92160E") ?? .red
    static let errorRed = Color(hex: "#CC0000") ?? .red
    static let inputGray = Color(hex: "#E8EAED") ?? Color(white: 0.92)
    static let inputText = Color(hex: "#1A1A1A") ?? .primary
    static let placeholderGray = Color(hex: "#666666") ?? .secondary
}

struct VolunteerAuthScaffold<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VolunteerGoldHeaderBar(text: "Jewel Heart Volunteers")
                VStack(spacing: 10) {
                    content()
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
        }
    }
}

struct VolunteerGoldHeaderBar: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(.black)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 44)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(JewelHeartAuthColors.gold)
    }
}

struct VolunteerBlueBar: View {
    let text: String
    var textColor: Color = .white

    var body: some View {
        Text(text)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(textColor)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 320)
            .frame(minHeight: 44)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(JewelHeartAuthColors.summaryBlue)
    }
}

struct VolunteerMaroonButton: View {
    let title: String
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .frame(minHeight: 44)
                .background(enabled ? JewelHeartAuthColors.actionMaroon : JewelHeartAuthColors.actionMaroon.opacity(0.45))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .shadow(color: .black.opacity(0.2), radius: 4, y: 2)
        }
        .disabled(!enabled)
        .buttonStyle(.plain)
        .padding(.vertical, 4)
    }
}

struct VolunteerGrayTextField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(JewelHeartAuthColors.placeholderGray)
            }
            TextField("", text: $text)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(JewelHeartAuthColors.inputText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
        .frame(maxWidth: 320)
        .frame(minHeight: 44, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(JewelHeartAuthColors.inputGray)
        .padding(.vertical, 4)
    }
}

struct VolunteerAuthMessage: View {
    let text: String
    let isError: Bool

    var body: some View {
        Text(text)
            .font(.system(size: 15, weight: isError ? .regular : .bold))
            .foregroundStyle(isError ? JewelHeartAuthColors.errorRed : Color(hex: "#0D7A4A") ?? .green)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 320)
            .padding(.top, 6)
    }
}
