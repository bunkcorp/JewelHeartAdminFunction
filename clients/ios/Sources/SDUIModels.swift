import Foundation

/// Mirrors KarmaDots SDUI wire format (subset).
/// Also accepts legacy/stub payloads: `version` (instead of `schemaVersion`), `screen.screenId`, `screen.sections` with `{ type, text }`.
struct SDUIEnvelope: Codable {
    let schemaVersion: Int
    let minAppVersion: String?
    let screen: SDUIScreen

    enum CodingKeys: String, CodingKey {
        case schemaVersion
        case version
        case minAppVersion
        case screen
    }

    init(schemaVersion: Int, minAppVersion: String?, screen: SDUIScreen) {
        self.schemaVersion = schemaVersion
        self.minAppVersion = minAppVersion
        self.screen = screen
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let sv = try c.decodeIfPresent(Int.self, forKey: .schemaVersion) {
            schemaVersion = sv
        } else if let v = try c.decodeIfPresent(Int.self, forKey: .version) {
            schemaVersion = v
        } else {
            throw DecodingError.keyNotFound(
                CodingKeys.schemaVersion,
                .init(codingPath: c.codingPath, debugDescription: "Missing schemaVersion or version")
            )
        }
        minAppVersion = try c.decodeIfPresent(String.self, forKey: .minAppVersion)
        screen = try c.decode(SDUIScreen.self, forKey: .screen)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encodeIfPresent(minAppVersion, forKey: .minAppVersion)
        try c.encode(screen, forKey: .screen)
    }
}

struct SDUIScreen: Codable {
    let id: String
    let title: String?
    let components: [UIComponent]?

    enum CodingKeys: String, CodingKey {
        case id
        case screenId
        case title
        case components
        case sections
    }

    init(id: String, title: String?, components: [UIComponent]?) {
        self.id = id
        self.title = title
        self.components = components
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let i = try c.decodeIfPresent(String.self, forKey: .id) {
            id = i
        } else if let sid = try c.decodeIfPresent(String.self, forKey: .screenId) {
            id = sid
        } else {
            throw DecodingError.keyNotFound(
                CodingKeys.id,
                .init(codingPath: c.codingPath, debugDescription: "Missing id or screenId")
            )
        }
        title = try c.decodeIfPresent(String.self, forKey: .title)
        if let comps = try c.decodeIfPresent([UIComponent].self, forKey: .components) {
            components = comps
        } else if let secs = try c.decodeIfPresent([SDUIStubSection].self, forKey: .sections) {
            components = secs.map(\.asUIComponent)
        } else {
            components = nil
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(components, forKey: .components)
    }
}

/// Wire shape used by some deployed stubs: `{ "type": "text", "text": "..." }`.
private struct SDUIStubSection: Decodable {
    let type: String
    let text: String?
    let content: String?

    var asUIComponent: UIComponent {
        UIComponent(
            type: type,
            layout: nil,
            spacing: nil,
            style: nil,
            content: content ?? text,
            label: nil,
            icon: nil,
            textStyle: nil,
            children: nil,
            action: nil
        )
    }
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
    /// Full-width bar fill (e.g. volunteer home mockup: #FFCA10, #7A95CA).
    let backgroundColor: String?
    /// Pill / button corner radius (dp).
    let borderRadius: Double?
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
