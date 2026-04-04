import Foundation
import FirebaseAuth

enum JewelHeartAPIError: LocalizedError {
    case noToken
    case http(Int, String?)
    case decode(Error)

    var errorDescription: String? {
        switch self {
        case .noToken: return "Not signed in"
        case .http(let c, let b): return Self.httpMessage(code: c, body: b)
        case .decode(let e): return e.localizedDescription
        }
    }

    /// Avoid dumping full Cloudflare/HTML error pages into the UI.
    private static func httpMessage(code: Int, body: String?) -> String {
        switch code {
        case 530:
            return "HTTP 530 — Cloudflare tunnel isn’t connected (host Mac asleep, tunnel stopped, or brief outage). Wake the Mac that runs cloudflared, or restart the tunnel, then Reload."
        case 502:
            return "HTTP 502 — API origin behind Cloudflare is down or not reachable. Check private-server and tunnel."
        case 503:
            return "HTTP 503 — service unavailable. Try again shortly."
        default:
            break
        }

        guard let body, !body.isEmpty else { return "HTTP \(code)" }
        let looksLikeHtml =
            body.range(of: "<!DOCTYPE", options: .caseInsensitive) != nil
            || body.range(of: "<html", options: .caseInsensitive) != nil
        if looksLikeHtml {
            switch code {
            case 502:
                return "HTTP 502 Bad Gateway — the API origin behind Cloudflare is down, not reachable, or timing out. Confirm private-server is running and the tunnel/DNS target is correct."
            case 503:
                return "HTTP 503 — service unavailable. Try again shortly."
            default:
                return "HTTP \(code) — server returned an HTML error page (often Cloudflare or a proxy)."
            }
        }
        let trimmed = body.count > 400 ? String(body.prefix(400)) + "…" : body
        return "HTTP \(code): \(trimmed)"
    }
}

actor JewelHeartAPI {
    private let session: URLSession

    init(session: URLSession? = nil) {
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.waitsForConnectivity = true
            config.timeoutIntervalForRequest = 60
            config.timeoutIntervalForResource = 120
            self.session = URLSession(configuration: config)
        }
    }

    /// Resolve the ID token on the main actor (avoids Firebase Auth off-main-thread edge cases).
    private func firebaseIDToken() async throws -> String {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<String, Error>) in
            Task { @MainActor in
                do {
                    guard let user = Auth.auth().currentUser else {
                        cont.resume(throwing: JewelHeartAPIError.noToken)
                        return
                    }
                    let token = try await user.getIDToken()
                    cont.resume(returning: token)
                } catch {
                    cont.resume(throwing: error)
                }
            }
        }
    }

    private func authorizedRequest(path: String, method: String, jsonBody: [String: Any]?) async throws -> (Data, HTTPURLResponse) {
        let token = try await firebaseIDToken()
        var req = URLRequest(url: JewelHeartConfig.baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let jsonBody {
            req.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
        }

        var lastError: Error?
        for attempt in 0 ..< 4 {
            do {
                let (data, resp) = try await session.data(for: req)
                guard let http = resp as? HTTPURLResponse else { throw JewelHeartAPIError.http(-1, nil) }
                guard (200 ... 299).contains(http.statusCode) else {
                    let text = String(data: data, encoding: .utf8)
                    throw JewelHeartAPIError.http(http.statusCode, text)
                }
                return (data, http)
            } catch let urlError as URLError where Self.isTransient(urlError) && attempt < 3 {
                lastError = urlError
                let delayNs: UInt64 = 400_000_000 * UInt64(attempt + 1)
                try await Task.sleep(nanoseconds: delayNs)
            } catch {
                throw error
            }
        }
        throw lastError ?? URLError(.unknown)
    }

    private static func isTransient(_ e: URLError) -> Bool {
        switch e.code {
        case .networkConnectionLost, .timedOut, .cannotConnectToHost, .dnsLookupFailed,
             .notConnectedToInternet, .internationalRoamingOff, .callIsActive, .dataNotAllowed:
            return true
        default:
            return false
        }
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
