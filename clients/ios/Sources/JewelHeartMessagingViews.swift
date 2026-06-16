import SwiftUI

private let jewelheartSelfVolunteerIdKey = "jewelheart.selfVolunteerId"

// MARK: - List (per retreat)

struct RetreatMessagingListView: View {
    let retreatId: String
    private let api = JewelHeartAPI()
    @State private var items: [ConversationSummary] = []
    @State private var error: String?
    @State private var busy = true
    @State private var showPeerSheet = false
    @State private var threadToShow: ConversationSummary?

    var body: some View {
        Group {
            if let error {
                ContentUnavailableView("Couldn’t load", systemImage: "exclamationmark.triangle", description: Text(error))
            } else if busy {
                ProgressView()
            } else if items.isEmpty {
                ContentUnavailableView("No conversations", systemImage: "bubble.left.and.bubble.right")
            } else {
                List(items) { c in
                    NavigationLink {
                        RetreatConversationThreadView(conversation: c)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(title(for: c)).font(.headline)
                            Text(subtitle(for: c)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Messages")
        .sheet(item: $threadToShow) { c in
            NavigationStack {
                RetreatConversationThreadView(conversation: c)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { threadToShow = nil }
                        }
                    }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New message") { showPeerSheet = true }
            }
        }
        .sheet(isPresented: $showPeerSheet) {
            DirectConversationPeerSheet(retreatId: retreatId, isPresented: $showPeerSheet) { conv in
                threadToShow = conv
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func title(for c: ConversationSummary) -> String {
        switch c.kind {
        case .retreat_room: "Everyone (retreat)"
        case .direct: c.peerDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "Direct"
        }
    }

    private func subtitle(for c: ConversationSummary) -> String {
        switch c.kind {
        case .retreat_room: "Everyone"
        case .direct: "Direct message"
        }
    }

    private func load() async {
        // Avoid replacing the conversation `List` with `ProgressView` while the stack
        // already shows rows — that drops `NavigationLink(value:)` hosts and pops pushes.
        await MainActor.run {
            error = nil
            if items.isEmpty { busy = true }
        }
        do {
            _ = try await api.ensureRetreatRoomConversation(retreatId: retreatId)
            let res = try await api.listRetreatConversations(retreatId: retreatId)
            await MainActor.run {
                items = res.items
                busy = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }
}

// MARK: - Direct peer picker

private struct DirectConversationPeerSheet: View {
    let retreatId: String
    @Binding var isPresented: Bool
    var onCreated: (ConversationSummary) -> Void

    private let api = JewelHeartAPI()
    @State private var linked: [RetreatVolunteer] = []
    @State private var error: String?
    @State private var busy = true
    @State private var creating: String?

    var body: some View {
        NavigationStack {
            Group {
                if busy {
                    ProgressView()
                } else if let error {
                    Text(error).foregroundStyle(.red).padding()
                } else if linked.isEmpty {
                    ContentUnavailableView("No linked volunteers", systemImage: "person.3")
                } else {
                    List(linked) { row in
                        Button {
                            Task { await startDirect(with: row.volunteerId) }
                        } label: {
                            HStack {
                                Text(row.volunteer.displayName)
                                if creating == row.volunteerId {
                                    Spacer()
                                    ProgressView()
                                }
                            }
                        }
                        .disabled(creating != nil)
                    }
                }
            }
            .navigationTitle("Message volunteer")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { isPresented = false }
                }
            }
            .task { await loadPeers() }
        }
    }

    private func loadPeers() async {
        await MainActor.run { busy = true; error = nil }
        do {
            let res = try await api.listRetreatVolunteers(retreatId: retreatId)
            await MainActor.run {
                linked = res.items
                busy = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }

    private func startDirect(with peerVolunteerId: String) async {
        await MainActor.run { creating = peerVolunteerId; error = nil }
        defer { Task { @MainActor in creating = nil } }
        do {
            let conv = try await api.createDirectConversation(retreatId: retreatId, peerVolunteerId: peerVolunteerId)
            await MainActor.run {
                isPresented = false
                onCreated(conv)
            }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Thread

struct RetreatConversationThreadView: View {
    let conversation: ConversationSummary
    private let api = JewelHeartAPI()
    @State private var messages: [ChatMessage] = []
    @State private var nextCursor: String?
    @State private var error: String?
    @State private var draft = ""
    @State private var sending = false
    @State private var loadingMore = false
    @State private var initialLoaded = false

    var body: some View {
        VStack(spacing: 0) {
            if let error {
                Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal)
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(messages.reversed())) { m in
                        messageRow(m)
                            .onAppear {
                                guard initialLoaded, !loadingMore, let nc = nextCursor else { return }
                                guard messages.count >= 8 else { return }
                                if m.id == messages.last?.id {
                                    Task { await loadOlder(cursor: nc) }
                                }
                            }
                    }
                }
                .padding()
            }
            HStack(alignment: .bottom) {
                TextField("Message", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1 ... 4)
                Button("Send") { Task { await send() } }
                    .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding()
        }
        .navigationTitle("Thread")
        .task { await reload(reset: true) }
    }

    @ViewBuilder
    private func messageRow(_ m: ChatMessage) -> some View {
        let bubble =
            VStack(alignment: .leading, spacing: 2) {
                Text(m.senderDisplayName ?? String(m.senderVolunteerId.prefix(8)))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(m.body)
                    .font(.body)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 8))

        if canRecallDelete(m) {
            bubble.contextMenu {
                Button("Delete", role: .destructive) {
                    Task { await deleteMessage(m) }
                }
            }
        } else {
            bubble
        }
    }

    private func canRecallDelete(_ m: ChatMessage) -> Bool {
        guard let selfId = UserDefaults.standard.string(forKey: jewelheartSelfVolunteerIdKey),
              selfId == m.senderVolunteerId else { return false }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var d = f.date(from: m.createdAt)
        if d == nil {
            f.formatOptions = [.withInternetDateTime]
            d = f.date(from: m.createdAt)
        }
        guard let sent = d else { return false }
        return Date().timeIntervalSince(sent) <= 15 * 60
    }

    private func reload(reset: Bool) async {
        await MainActor.run { error = nil; if reset { initialLoaded = false } }
        do {
            _ = try await api.markConversationRead(conversationId: conversation.id)
            let page = try await api.listConversationMessages(conversationId: conversation.id, limit: 40)
            await MainActor.run {
                messages = page.items
                nextCursor = page.nextCursor
                initialLoaded = true
            }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func loadOlder(cursor: String) async {
        await MainActor.run { loadingMore = true; error = nil }
        defer { Task { @MainActor in loadingMore = false } }
        do {
            let page = try await api.listConversationMessages(conversationId: conversation.id, limit: 40, cursor: cursor)
            await MainActor.run {
                messages.append(contentsOf: page.items)
                nextCursor = page.nextCursor
            }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func send() async {
        let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        await MainActor.run { sending = true; error = nil }
        defer { Task { @MainActor in sending = false } }
        do {
            let sent = try await api.sendConversationMessage(conversationId: conversation.id, body: t)
            await MainActor.run {
                draft = ""
                messages.insert(sent, at: 0)
            }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func deleteMessage(_ m: ChatMessage) async {
        await MainActor.run { error = nil }
        do {
            try await api.deleteJewelHeartMessage(messageId: m.id)
            await MainActor.run {
                messages.removeAll { $0.id == m.id }
            }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
