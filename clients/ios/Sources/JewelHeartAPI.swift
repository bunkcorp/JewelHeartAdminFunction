import Foundation
import FirebaseAuth
import FirebaseCore
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
        case 404:
            if let body, body.localizedCaseInsensitiveContains("conversations") {
                return "HTTP 404 — messaging routes are not on this API host yet. Deploy the latest private-server `jewelheart` router (conversations + messages) and restart Node."
            }
            fallthrough
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
    private let cache = JewelHeartReadCache.shared

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
    private func firebaseAuthContext() async throws -> (uid: String, token: String) {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<(uid: String, token: String), Error>) in
            Task { @MainActor in
                do {
                    if FirebaseApp.app() == nil {
                        FirebaseApp.configure()
                    }
                    guard let user = Auth.auth().currentUser else {
                        cont.resume(throwing: JewelHeartAPIError.noToken)
                        return
                    }
                    let token = try await user.getIDToken()
                    cont.resume(returning: (uid: user.uid, token: token))
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
        let auth = try await firebaseAuthContext()
        return try await authorizedDataRequestWithToken(
            path: path,
            method: method,
            queryItems: queryItems,
            httpBody: httpBody,
            contentType: contentType,
            token: auth.token
        )
    }

    /// Bearer-authenticated read-through request. Fresh cached responses are returned without a network hop;
    /// stale responses are used only after transient network/server failures.
    internal func authorizedCachedDataRequest(
        path: String,
        method: String,
        queryItems: [URLQueryItem] = [],
        httpBody: Data? = nil,
        contentType: String? = nil,
        cacheNamespace: String,
        cacheKey: String,
        ttl: TimeInterval
    ) async throws -> Data {
        let auth = try await firebaseAuthContext()
        let scopedKey = "\(auth.uid)|\(JewelHeartConfig.baseURL.absoluteString)|\(cacheKey)"
        if let data = await cache.data(namespace: cacheNamespace, key: scopedKey, maxAge: ttl) {
            JewelHeartLog.apiInfo("read cache hit namespace=\(cacheNamespace) key=\(cacheKey)")
            return data
        }
        do {
            let (data, _) = try await authorizedDataRequestWithToken(
                path: path,
                method: method,
                queryItems: queryItems,
                httpBody: httpBody,
                contentType: contentType,
                token: auth.token
            )
            await cache.put(data, namespace: cacheNamespace, key: scopedKey)
            return data
        } catch {
            if Self.canServeStaleCache(for: error),
               let data = await cache.data(namespace: cacheNamespace, key: scopedKey, maxAge: nil) {
                JewelHeartLog.apiWarning("read cache stale fallback namespace=\(cacheNamespace) key=\(cacheKey) error=\(JewelHeartLog.describe(error))")
                return data
            }
            throw error
        }
    }

    internal func invalidateReadCache(namespace: String) async {
        await cache.invalidate(namespace: namespace)
    }

    internal func invalidateReadCaches(_ namespaces: [String]) async {
        for namespace in namespaces {
            await cache.invalidate(namespace: namespace)
        }
    }

    internal static func cacheKey(path: String, queryItems: [URLQueryItem] = []) -> String {
        guard !queryItems.isEmpty else { return path }
        let q = queryItems
            .map { "\($0.name)=\($0.value ?? "")" }
            .sorted()
            .joined(separator: "&")
        return "\(path)?\(q)"
    }

    internal static func sduiCacheKey(screenId: String, retreatId: String?, params: [String: String]) -> String {
        let p = params
            .map { "\($0.key)=\($0.value)" }
            .sorted()
            .joined(separator: "&")
        return "jewelheart/sdui/screen|screenId=\(screenId)|retreatId=\(retreatId ?? "")|params=\(p)"
    }

    private func authorizedDataRequestWithToken(
        path: String,
        method: String,
        queryItems: [URLQueryItem],
        httpBody: Data?,
        contentType: String?,
        token: String
    ) async throws -> (Data, HTTPURLResponse) {
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

    private static func canServeStaleCache(for error: Error) -> Bool {
        if let urlError = error as? URLError {
            return isTransient(urlError)
        }
        if case JewelHeartAPIError.http(let code, _) = error {
            return [-1, 502, 503, 530].contains(code)
        }
        return false
    }

    func fetchScreen(screenId: String, retreatId: String? = nil, params: [String: String] = [:]) async throws -> SDUIEnvelope {
        JewelHeartLog.apiInfo(
            "fetchScreen screenId=\(screenId) retreatId=\(retreatId ?? "nil") params=\(String(describing: params)) baseURL=\(JewelHeartConfig.baseURL.absoluteString)"
        )
        var body: [String: Any] = ["screenId": screenId]
        if let retreatId { body["retreatId"] = retreatId }
        if !params.isEmpty { body["params"] = params }
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let data: Data
        if params["checkinOp"] != nil {
            (data, _) = try await authorizedDataRequest(
                path: "jewelheart/sdui/screen",
                method: "POST",
                httpBody: bodyData,
                contentType: "application/json"
            )
        } else {
            data = try await authorizedCachedDataRequest(
                path: "jewelheart/sdui/screen",
                method: "POST",
                httpBody: bodyData,
                contentType: "application/json",
                cacheNamespace: JewelHeartReadCacheNamespace.sduiScreens,
                cacheKey: Self.sduiCacheKey(screenId: screenId, retreatId: retreatId, params: params),
                ttl: JewelHeartReadCacheTTL.standard
            )
        }
        do {
            let dec = JSONDecoder()
            return try dec.decode(SDUIEnvelope.self, from: data)
        } catch {
            JewelHeartLog.apiError("JSON decode failed: \(JewelHeartLog.describe(error)) dataPrefix=\(String(data: data.prefix(200), encoding: .utf8) ?? "?")")
            throw JewelHeartAPIError.decode(error)
        }
    }
}

enum JewelHeartReadCacheNamespace {
    static let retreats = "retreats"
    static let retreatVolunteers = "retreatVolunteers"
    static let sduiScreens = "sduiScreens"
    static let conversations = "conversations"
    static let messages = "messages"
}

enum JewelHeartReadCacheTTL {
    static let standard: TimeInterval = 60
    static let messages: TimeInterval = 30
}

private actor JewelHeartReadCache {
    static let shared = JewelHeartReadCache()

    private struct Entry: Codable {
        let savedAt: Date
        let data: Data
    }

    private let directory: URL?
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        guard let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            directory = nil
            return
        }
        let dir = base.appendingPathComponent("JewelHeartReadCache", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        directory = dir
    }

    func data(namespace: String, key: String, maxAge: TimeInterval?) -> Data? {
        guard let url = fileURL(namespace: namespace, key: key),
              let bytes = try? Data(contentsOf: url),
              let entry = try? decoder.decode(Entry.self, from: bytes) else { return nil }
        if let maxAge, Date().timeIntervalSince(entry.savedAt) > maxAge {
            return nil
        }
        return entry.data
    }

    func put(_ data: Data, namespace: String, key: String) {
        guard let url = fileURL(namespace: namespace, key: key) else { return }
        let entry = Entry(savedAt: Date(), data: data)
        guard let bytes = try? encoder.encode(entry) else { return }
        try? bytes.write(to: url, options: [.atomic])
    }

    func invalidate(namespace: String) {
        guard let directory,
              let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else { return }
        let prefix = "\(namespace)-"
        for file in files where file.lastPathComponent.hasPrefix(prefix) {
            try? FileManager.default.removeItem(at: file)
        }
    }

    private func fileURL(namespace: String, key: String) -> URL? {
        directory?.appendingPathComponent("\(namespace)-\(stableHash(key)).json")
    }

    private func stableHash(_ value: String) -> String {
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in value.utf8 {
            hash ^= UInt64(byte)
            hash &*= 1_099_511_628_211
        }
        return String(hash, radix: 16)
    }
}
