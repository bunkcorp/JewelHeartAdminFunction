import Foundation

/// Mirrors KarmaDots SDUI wire format (subset).
struct SDUIEnvelope: Codable {
    let schemaVersion: Int
    let minAppVersion: String?
    let screen: SDUIScreen
}

struct SDUIScreen: Codable {
    let id: String
    let title: String?
    let components: [UIComponent]?
}

struct UIComponent: Codable, Identifiable {
    var id: String { "\(type)|\(label ?? "")|\(content ?? "")|\(icon ?? "")" }
    let type: String
    let layout: String?
    let spacing: Double?
    let style: ComponentStyle?
    let content: String?
    let label: String?
    let icon: String?
    let textStyle: TextStyle?
    let children: [UIComponent]?
    let action: SDUIAction?
}

struct TextStyle: Codable {
    let fontSize: Double?
    let fontWeight: String?
    let textAlign: String?
    let color: String?
}

struct ComponentStyle: Codable {
    let padding: PaddingSpec?
    let margin: MarginSpec?
    let height: DimensionSpec?
    let width: DimensionSpec?
}

struct PaddingSpec: Codable {
    let all: Double?
    let top: Double?
    let bottom: Double?
    let left: Double?
    let right: Double?
}

struct MarginSpec: Codable {
    let top: Double?
    let bottom: Double?
    let left: Double?
    let right: Double?
    let all: Double?
}

struct DimensionSpec: Codable {
    let value: Double?
    let unit: String?
}

struct SDUIAction: Codable {
    let type: String
    let target: String?
    /// Server sends string-keyed payloads (retreatId, date, …).
    let payload: [String: String]?
}

extension UIComponent {
    func stringPayload(_ key: String) -> String? {
        action?.payload?[key]
    }
}
