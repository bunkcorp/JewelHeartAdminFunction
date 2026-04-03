import Foundation
import FirebaseAuth

enum JewelHeartAPIError: LocalizedError {
    case noToken
    case http(Int, String?)
    case decode(Error)

    var errorDescription: String? {
        switch self {
        case .noToken: return "Not signed in"
        case .http(let c, let b): return "HTTP \(c): \(b ?? "")"
        case .decode(let e): return e.localizedDescription
        }
    }
}

actor JewelHeartAPI {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    private func authorizedRequest(path: String, method: String, jsonBody: [String: Any]?) async throws -> (Data, HTTPURLResponse) {
        guard let user = Auth.auth().currentUser else { throw JewelHeartAPIError.noToken }
        let token = try await user.getIDToken()
        var req = URLRequest(url: JewelHeartConfig.baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let jsonBody {
            req.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
        }
        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw JewelHeartAPIError.http(-1, nil) }
        guard (200 ... 299).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8)
            throw JewelHeartAPIError.http(http.statusCode, text)
        }
        return (data, http)
    }

    func fetchScreen(screenId: String, retreatId: String? = nil, params: [String: String] = [:]) async throws -> SDUIEnvelope {
        var body: [String: Any] = ["screenId": screenId]
        if let retreatId { body["retreatId"] = retreatId }
        if !params.isEmpty { body["params"] = params }
        let (data, _) = try await authorizedRequest(path: "jewelheart/sdui/screen", method: "POST", jsonBody: body)
        do {
            let dec = JSONDecoder()
            return try dec.decode(SDUIEnvelope.self, from: data)
        } catch {
            throw JewelHeartAPIError.decode(error)
        }
    }
}
