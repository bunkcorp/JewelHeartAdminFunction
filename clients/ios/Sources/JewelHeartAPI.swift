import Foundation
import FirebaseAuth
import os

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
        case 403:
            return "JewelHeart admin access required (HTTP 403). Add your Firebase user ID to Postgres: jewelheart_admins (global), or jewelheart_retreat_admins (per retreat). Template: scripts/sql/insert-jewelheart-admin-global.sql"
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

    /// One line for Xcode console (subsystem org.jewelheart.admin).
    var logLine: String {
        switch self {
        case .noToken:
            return "JewelHeartAPIError.noToken (no Firebase user)"
        case .http(let code, let body):
            let preview = (body ?? "")
                .replacingOccurrences(of: "\n", with: " ")
                .prefix(240)
            return "JewelHeartAPIError.http status=\(code) bodyPreview=\(String(preview))"
        case .decode(let e):
            return "JewelHeartAPIError.decode \(JewelHeartLog.describe(e))"
        }
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

    internal static func makeAPIURL(path: String, queryItems: [URLQueryItem] = []) -> URL {
        var comp = URLComponents()
        comp.scheme = JewelHeartConfig.useTLS ? "https" : "http"
        comp.host = JewelHeartConfig.apiHost
        let trimmed = path.hasPrefix("/") ? String(path.dropFirst()) : path
        comp.path = "/" + trimmed
        if !queryItems.isEmpty {
            comp.queryItems = queryItems
        }
        guard let url = comp.url else {
            preconditionFailure("invalid API URL path=\(path)")
        }
        return url
    }

    /// Unauthenticated request (e.g. `GET /jewelheart/health`).
    internal func publicDataRequest(
        path: String,
        method: String,
        queryItems: [URLQueryItem] = []
    ) async throws -> (Data, HTTPURLResponse) {
        let url = Self.makeAPIURL(path: path, queryItems: queryItems)
        var req = URLRequest(url: url)
        req.httpMethod = method
        return try await dataWithRetries(request: req, urlForLog: url)
    }

    /// Bearer-authenticated request. Set `httpBody` + `contentType` for POST/PATCH bodies; omit both for GET/DELETE.
    internal func authorizedDataRequest(
        path: String,
        method: String,
        queryItems: [URLQueryItem] = [],
        httpBody: Data? = nil,
        contentType: String? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        let token = try await firebaseIDToken()
        let url = Self.makeAPIURL(path: path, queryItems: queryItems)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let httpBody {
            req.httpBody = httpBody
            req.setValue(contentType ?? "application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await dataWithRetries(request: req, urlForLog: url)
    }

    private func dataWithRetries(request req: URLRequest, urlForLog: URL) async throws -> (Data, HTTPURLResponse) {
        JewelHeartLog.apiInfo("request \(req.httpMethod ?? "?") \(urlForLog.absoluteString)")

        let maxAttempts = 8
        var lastError: Error?
        for attempt in 0 ..< maxAttempts {
            do {
                let (data, resp) = try await session.data(for: req)
                guard let http = resp as? HTTPURLResponse else {
                    JewelHeartLog.apiError("non-HTTP response for \(urlForLog.absoluteString)")
                    throw JewelHeartAPIError.http(-1, nil)
                }
                let cfRay = http.value(forHTTPHeaderField: "cf-ray") ?? "-"
                let cfCache = http.value(forHTTPHeaderField: "cf-cache-status") ?? "-"
                guard (200 ... 299).contains(http.statusCode) else {
                    let text = String(data: data, encoding: .utf8)
                    JewelHeartLog.apiError(
                        "HTTP failure status=\(http.statusCode) url=\(urlForLog.absoluteString) cf-ray=\(cfRay) cf-cache-status=\(cfCache) bodyChars=\(data.count)"
                    )
                    if let text, !text.isEmpty {
                        let oneLine = text.replacingOccurrences(of: "\n", with: " ").prefix(500)
                        JewelHeartLog.apiError("response body (truncated): \(String(oneLine))")
                    }
                    if [530, 502].contains(http.statusCode), attempt < maxAttempts - 1 {
                        JewelHeartLog.apiWarning(
                            "retryable HTTP status=\(http.statusCode) attempt=\(attempt + 1)/\(maxAttempts) cf-ray=\(cfRay)"
                        )
                        let delayNs: UInt64 = 1_000_000_000 * UInt64(attempt + 1)
                        try await Task.sleep(nanoseconds: delayNs)
                        continue
                    }
                    throw JewelHeartAPIError.http(http.statusCode, text)
                }
                JewelHeartLog.apiInfo("HTTP \(http.statusCode) ok cf-ray=\(cfRay) bytes=\(data.count)")
                return (data, http)
            } catch let urlError as URLError where Self.isTransient(urlError) && attempt < maxAttempts - 1 {
                lastError = urlError
                JewelHeartLog.apiWarning(
                    "transient network attempt=\(attempt + 1)/\(maxAttempts) \(JewelHeartLog.describe(urlError))"
                )
                let delayNs: UInt64 = 400_000_000 * UInt64(attempt + 1)
                try await Task.sleep(nanoseconds: delayNs)
            } catch {
                JewelHeartLog.apiError("failed \(JewelHeartLog.describe(error))")
                throw error
            }
        }
        if let lastError {
            JewelHeartLog.apiError("gave up after retries: \(JewelHeartLog.describe(lastError))")
        }
        throw lastError ?? URLError(.unknown)
    }

    internal func jsonEncoder() -> JSONEncoder {
        let e = JSONEncoder()
        return e
    }

    internal func jsonDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        // REST payloads may use camelCase (Node mappers) or snake_case; this keeps both decodable.
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
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
        JewelHeartLog.apiInfo(
            "fetchScreen screenId=\(screenId) retreatId=\(retreatId ?? "nil") params=\(String(describing: params)) baseURL=\(JewelHeartConfig.baseURL.absoluteString)"
        )
        var body: [String: Any] = ["screenId": screenId]
        if let retreatId { body["retreatId"] = retreatId }
        if !params.isEmpty { body["params"] = params }
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/sdui/screen",
            method: "POST",
            httpBody: bodyData,
            contentType: "application/json"
        )
        do {
            let dec = JSONDecoder()
            return try dec.decode(SDUIEnvelope.self, from: data)
        } catch {
            JewelHeartLog.apiError("JSON decode failed: \(JewelHeartLog.describe(error)) dataPrefix=\(String(data: data.prefix(200), encoding: .utf8) ?? "?")")
            throw JewelHeartAPIError.decode(error)
        }
    }
}
