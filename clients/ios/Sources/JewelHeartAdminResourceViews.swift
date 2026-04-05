import SwiftUI
import UniformTypeIdentifiers
import UIKit

// MARK: - Date (API `format: date`)

enum AdminDayFormat {
    static let api: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

// MARK: - Retreats

struct RetreatAdminListView: View {
    private let api = JewelHeartAPI()
    @State private var items: [Retreat] = []
    @State private var nextCursor: String?
    @State private var error: String?
    @State private var showCreate = false

    var body: some View {
        Group {
            if let error {
                ContentUnavailableView("Error", systemImage: "exclamationmark.triangle", description: Text(error))
            } else if items.isEmpty {
                ContentUnavailableView("No retreats", systemImage: "mountain.2", description: Text("Create one or pull to refresh."))
            } else {
                List(items) { r in
                    NavigationLink(value: r) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(r.name).font(.headline)
                            Text("\(r.status.rawValue) · \(r.timezone)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Retreats")
        .navigationDestination(for: Retreat.self) { r in
            RetreatDetailView(retreat: r)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showCreate = true
                } label: {
                    Image(systemName: "plus")
                }
            }
            ToolbarItem(placement: .topBarLeading) {
                Button("Reload") { Task { await load() } }
            }
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                RetreatCreateFormView { Task { await load(); showCreate = false } }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        await MainActor.run { error = nil }
        do {
            let res = try await api.listRetreats(cursor: nil, limit: 100)
            await MainActor.run {
                items = res.items
                nextCursor = res.nextCursor
            }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct RetreatCreateFormView: View {
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var timezone = "America/New_York"
    @State private var status: RetreatStatus = .draft
    @State private var includeDates = false
    @State private var startDate = Date()
    @State private var endDate = Date()
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            TextField("Name", text: $name)
            TextField("IANA timezone", text: $timezone)
            Picker("Status", selection: $status) {
                ForEach(RetreatStatus.allCases) { s in
                    Text(s.rawValue).tag(s)
                }
            }
            Toggle("Start / end dates", isOn: $includeDates)
            if includeDates {
                DatePicker("Start", selection: $startDate, displayedComponents: .date)
                DatePicker("End", selection: $endDate, displayedComponents: .date)
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("New retreat")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") { Task { await save() } }.disabled(busy || name.isEmpty)
            }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            var body = RetreatCreate(name: name, timezone: timezone, startDate: nil, endDate: nil, status: status)
            if includeDates {
                body.startDate = AdminDayFormat.api.string(from: startDate)
                body.endDate = AdminDayFormat.api.string(from: endDate)
            }
            _ = try await api.createRetreat(body)
            await MainActor.run {
                onDone()
                dismiss()
            }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct RetreatDetailView: View {
    let retreat: Retreat
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var current: Retreat?
    @State private var error: String?
    @State private var showEdit = false
    @State private var confirmDelete = false

    private var r: Retreat { current ?? retreat }

    var body: some View {
        List {
            Section("Summary") {
                LabeledContent("Status") { Text(r.status.rawValue) }
                LabeledContent("Timezone") { Text(r.timezone) }
                if let s = r.startDate { LabeledContent("Start") { Text(s) } }
                if let e = r.endDate { LabeledContent("End") { Text(e) } }
                LabeledContent("id") { Text(r.id).font(.caption.monospaced()) }
            }

            Section("Resources") {
                NavigationLink("Jobs") { JobListView(retreatId: r.id) }
                NavigationLink("Slots") { SlotListView(retreatId: r.id) }
                NavigationLink("Tasks") { JHTaskListView(retreatId: r.id) }
                NavigationLink("Linked volunteers") { RetreatVolunteerListView(retreatId: r.id) }
                NavigationLink("Schedule (by day)") { ScheduleDayView(retreatId: r.id) }
                NavigationLink("Reports (PDF/CSV)") { ReportsView(retreatId: r.id) }
            }

            Section {
                Button("Edit retreat") { showEdit = true }
                Button("Delete retreat", role: .destructive) { confirmDelete = true }
            }
        }
        .navigationTitle(r.name)
        .task { await refresh() }
        .sheet(isPresented: $showEdit) {
            NavigationStack {
                RetreatEditFormView(retreat: r) {
                    Task { await refresh(); showEdit = false }
                }
            }
        }
        .confirmationDialog("Delete this retreat and all nested data?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await deleteRetreat() } }
            Button("Cancel", role: .cancel) {}
        }
        if let error { Text(error).foregroundStyle(.red).padding() }
    }

    private func refresh() async {
        do {
            let x = try await api.getRetreat(retreatId: retreat.id)
            await MainActor.run { current = x; error = nil }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func deleteRetreat() async {
        do {
            try await api.deleteRetreat(retreatId: retreat.id)
            await MainActor.run { dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct RetreatEditFormView: View {
    let retreat: Retreat
    var onSaved: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var timezone: String
    @State private var status: RetreatStatus
    @State private var startDate: Date
    @State private var endDate: Date
    @State private var hasStart: Bool
    @State private var hasEnd: Bool
    @State private var error: String?
    @State private var busy = false

    init(retreat: Retreat, onSaved: @escaping () -> Void) {
        self.retreat = retreat
        self.onSaved = onSaved
        _name = State(initialValue: retreat.name)
        _timezone = State(initialValue: retreat.timezone)
        _status = State(initialValue: retreat.status)
        let df = AdminDayFormat.api
        _hasStart = State(initialValue: retreat.startDate != nil)
        _hasEnd = State(initialValue: retreat.endDate != nil)
        _startDate = State(initialValue: retreat.startDate.flatMap { df.date(from: $0) } ?? Date())
        _endDate = State(initialValue: retreat.endDate.flatMap { df.date(from: $0) } ?? Date())
    }

    var body: some View {
        Form {
            TextField("Name", text: $name)
            TextField("Timezone", text: $timezone)
            Picker("Status", selection: $status) {
                ForEach(RetreatStatus.allCases) { s in
                    Text(s.rawValue).tag(s)
                }
            }
            Toggle("Start date", isOn: $hasStart)
            if hasStart { DatePicker("Start", selection: $startDate, displayedComponents: .date) }
            Toggle("End date", isOn: $hasEnd)
            if hasEnd { DatePicker("End", selection: $endDate, displayedComponents: .date) }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Edit retreat")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }.disabled(busy)
            }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            let df = AdminDayFormat.api
            var patch = RetreatPatch()
            patch.name = name
            patch.timezone = timezone
            patch.status = status
            patch.startDate = hasStart ? df.string(from: startDate) : nil
            patch.endDate = hasEnd ? df.string(from: endDate) : nil
            _ = try await api.updateRetreat(retreatId: retreat.id, patch: patch)
            await MainActor.run {
                onSaved()
                dismiss()
            }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Jobs

struct JobListView: View {
    let retreatId: String
    private let api = JewelHeartAPI()
    @State private var items: [Job] = []
    @State private var error: String?
    @State private var showCreate = false

    var body: some View {
        Group {
            if let error {
                Text(error).foregroundStyle(.red)
            } else {
                List(items) { j in
                    NavigationLink(value: j) {
                        VStack(alignment: .leading) {
                            Text(j.title).font(.headline)
                            Text("Need \(j.volunteersNeeded) · \(j.estimatedMinutes) min").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Jobs")
        .navigationDestination(for: Job.self) { j in
            JobDetailView(retreatId: retreatId, job: j)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showCreate = true
                } label: {
                    Image(systemName: "plus")
                }
            }
            ToolbarItem(placement: .topBarLeading) {
                Button("Reload") { Task { await load() } }
            }
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                JobCreateFormView(retreatId: retreatId) { Task { await load(); showCreate = false } }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let res = try await api.listJobs(retreatId: retreatId)
            await MainActor.run { items = res.items; error = nil }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct JobDetailView: View {
    let retreatId: String
    let job: Job
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var showEdit = false
    @State private var confirmDelete = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                LabeledContent("Volunteers needed") { Text("\(job.volunteersNeeded)") }
                LabeledContent("Est. minutes") { Text("\(job.estimatedMinutes)") }
            }
            if !job.subjobs.isEmpty {
                Section("Subjobs") {
                    ForEach(Array(job.subjobs.enumerated()), id: \.offset) { _, s in
                        Text("\(s.sortOrder). \(s.text)")
                    }
                }
            }
            Section {
                Button("Edit") { showEdit = true }
                Button("Delete", role: .destructive) { confirmDelete = true }
            }
        }
        .navigationTitle(job.title)
        .sheet(isPresented: $showEdit) {
            NavigationStack {
                JobEditFormView(retreatId: retreatId, job: job) { showEdit = false }
            }
        }
        .confirmationDialog("Delete job?", isPresented: $confirmDelete) {
            Button("Delete", role: .destructive) { Task { await deleteJob() } }
            Button("Cancel", role: .cancel) {}
        }
        if let error { Text(error).foregroundStyle(.red) }
    }

    private func deleteJob() async {
        do {
            try await api.deleteJob(retreatId: retreatId, jobId: job.id)
            await MainActor.run { dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct JobCreateFormView: View {
    let retreatId: String
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var volunteersNeeded = 1
    @State private var estimatedMinutes = 30
    @State private var subjobLines = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            TextField("Title", text: $title)
            Stepper("Volunteers needed: \(volunteersNeeded)", value: $volunteersNeeded, in: 1 ... 999)
            Stepper("Estimated minutes: \(estimatedMinutes)", value: $estimatedMinutes, in: 0 ... 24 * 60)
            TextField("Subjobs (one per line, optional)", text: $subjobLines, axis: .vertical)
                .lineLimit(3 ... 8)
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("New job")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") { Task { await save() } }.disabled(busy || title.isEmpty)
            }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            let lines = subjobLines.split(separator: "\n").map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            var body = JobCreate(title: title, volunteersNeeded: volunteersNeeded, estimatedMinutes: estimatedMinutes, subjobs: nil)
            if !lines.isEmpty { body.subjobs = lines }
            _ = try await api.createJob(retreatId: retreatId, body: body)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct JobEditFormView: View {
    let retreatId: String
    let job: Job
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var volunteersNeeded: Int
    @State private var estimatedMinutes: Int
    @State private var subjobLines: String
    @State private var error: String?
    @State private var busy = false

    init(retreatId: String, job: Job, onDone: @escaping () -> Void) {
        self.retreatId = retreatId
        self.job = job
        self.onDone = onDone
        _title = State(initialValue: job.title)
        _volunteersNeeded = State(initialValue: job.volunteersNeeded)
        _estimatedMinutes = State(initialValue: job.estimatedMinutes)
        _subjobLines = State(initialValue: job.subjobs.map(\.text).joined(separator: "\n"))
    }

    var body: some View {
        Form {
            TextField("Title", text: $title)
            Stepper("Volunteers needed: \(volunteersNeeded)", value: $volunteersNeeded, in: 1 ... 999)
            Stepper("Estimated minutes: \(estimatedMinutes)", value: $estimatedMinutes, in: 0 ... 24 * 60)
            TextField("Subjobs (replace all, one per line)", text: $subjobLines, axis: .vertical)
                .lineLimit(3 ... 12)
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Edit job")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }.disabled(busy)
            }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            let lines = subjobLines.split(separator: "\n").map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            var patch = JobPatch()
            patch.title = title
            patch.volunteersNeeded = volunteersNeeded
            patch.estimatedMinutes = estimatedMinutes
            patch.subjobs = lines
            _ = try await api.updateJob(retreatId: retreatId, jobId: job.id, patch: patch)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Slots

struct SlotListView: View {
    let retreatId: String
    private let api = JewelHeartAPI()
    @State private var items: [Slot] = []
    @State private var error: String?
    @State private var filterByDate = false
    @State private var filterDate = Date()
    @State private var showCreate = false

    var body: some View {
        Group {
            if let error { Text(error).foregroundStyle(.red) }
            else {
                List(items) { s in
                    NavigationLink(value: s) {
                        VStack(alignment: .leading) {
                            Text(s.label).font(.headline)
                            Text("\(s.slotDate) · \(s.timeBand.rawValue)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Slots")
        .navigationDestination(for: Slot.self) { s in
            SlotDetailView(retreatId: retreatId, slot: s)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showCreate = true
                } label: {
                    Image(systemName: "plus")
                }
            }
            ToolbarItem(placement: .topBarLeading) {
                Button("Reload") { Task { await load() } }
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Toggle("Filter by date", isOn: $filterByDate)
                    .onChange(of: filterByDate) { _, _ in Task { await load() } }
                if filterByDate {
                    DatePicker("Date", selection: $filterDate, displayedComponents: .date)
                        .onChange(of: filterDate) { _, _ in Task { await load() } }
                }
            }
            .font(.caption)
            .padding(8)
            .background(.ultraThinMaterial)
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                SlotCreateFormView(retreatId: retreatId) { Task { await load(); showCreate = false } }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let dateStr = filterByDate ? AdminDayFormat.api.string(from: filterDate) : nil
            let res = try await api.listSlots(retreatId: retreatId, date: dateStr)
            await MainActor.run { items = res.items; error = nil }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct SlotDetailView: View {
    let retreatId: String
    let slot: Slot
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var showEdit = false
    @State private var confirmDelete = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                LabeledContent("Date") { Text(slot.slotDate) }
                LabeledContent("Band") { Text(slot.timeBand.rawValue) }
            }
            Section {
                Button("Edit") { showEdit = true }
                Button("Delete", role: .destructive) { confirmDelete = true }
            }
        }
        .navigationTitle(slot.label)
        .sheet(isPresented: $showEdit) {
            NavigationStack {
                SlotEditFormView(retreatId: retreatId, slot: slot) { showEdit = false }
            }
        }
        .confirmationDialog("Delete slot?", isPresented: $confirmDelete) {
            Button("Delete", role: .destructive) { Task { await deleteSlot() } }
            Button("Cancel", role: .cancel) {}
        }
        if let error { Text(error).foregroundStyle(.red) }
    }

    private func deleteSlot() async {
        do {
            try await api.deleteSlot(retreatId: retreatId, slotId: slot.id)
            await MainActor.run { dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct SlotCreateFormView: View {
    let retreatId: String
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var label = ""
    @State private var slotDate = Date()
    @State private var timeBand: TimeBand = .anytime
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            TextField("Label", text: $label)
            DatePicker("Slot date", selection: $slotDate, displayedComponents: .date)
            Picker("Time band", selection: $timeBand) {
                ForEach(TimeBand.allCases) { b in
                    Text(b.rawValue).tag(b)
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("New slot")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") { Task { await save() } }.disabled(busy || label.isEmpty)
            }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            let body = SlotCreate(
                label: label,
                slotDate: AdminDayFormat.api.string(from: slotDate),
                dayOfWeek: nil,
                activityContext: nil,
                timeBand: timeBand
            )
            _ = try await api.createSlot(retreatId: retreatId, body: body)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct SlotEditFormView: View {
    let retreatId: String
    let slot: Slot
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var label: String
    @State private var slotDate: Date
    @State private var timeBand: TimeBand
    @State private var error: String?
    @State private var busy = false

    init(retreatId: String, slot: Slot, onDone: @escaping () -> Void) {
        self.retreatId = retreatId
        self.slot = slot
        self.onDone = onDone
        _label = State(initialValue: slot.label)
        _slotDate = State(initialValue: AdminDayFormat.api.date(from: slot.slotDate) ?? Date())
        _timeBand = State(initialValue: slot.timeBand)
    }

    var body: some View {
        Form {
            TextField("Label", text: $label)
            DatePicker("Slot date", selection: $slotDate, displayedComponents: .date)
            Picker("Time band", selection: $timeBand) {
                ForEach(TimeBand.allCases) { b in
                    Text(b.rawValue).tag(b)
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Edit slot")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }.disabled(busy)
            }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            var patch = SlotPatch()
            patch.label = label
            patch.slotDate = AdminDayFormat.api.string(from: slotDate)
            patch.timeBand = timeBand
            _ = try await api.updateSlot(retreatId: retreatId, slotId: slot.id, patch: patch)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Tasks

struct JHTaskListView: View {
    let retreatId: String
    private let api = JewelHeartAPI()
    @State private var items: [JHTask] = []
    @State private var error: String?
    @State private var showCreate = false
    @State private var filterUnassigned = false
    @State private var filterUnderassigned = false

    var body: some View {
        Group {
            if let error { Text(error).foregroundStyle(.red) }
            else {
                List(items) { t in
                    NavigationLink(value: t) {
                        VStack(alignment: .leading) {
                            Text("Task \(String(t.id.prefix(8)))…").font(.headline)
                            Text("job \(String(t.jobId.prefix(8)))… · slot \(String(t.slotId.prefix(8)))…")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if t.isUnderassigned == true {
                                Text("Underassigned").font(.caption2).foregroundStyle(.orange)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Tasks")
        .navigationDestination(for: JHTask.self) { t in
            JHTaskDetailView(retreatId: retreatId, taskId: t.id)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showCreate = true
                } label: {
                    Image(systemName: "plus")
                }
            }
            ToolbarItem(placement: .topBarLeading) {
                Button("Reload") { Task { await load() } }
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(alignment: .leading, spacing: 4) {
                Toggle("unassignedOnly", isOn: $filterUnassigned)
                    .onChange(of: filterUnassigned) { _, _ in Task { await load() } }
                Toggle("underassignedOnly", isOn: $filterUnderassigned)
                    .onChange(of: filterUnderassigned) { _, _ in Task { await load() } }
            }
            .font(.caption)
            .padding(8)
            .background(.ultraThinMaterial)
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                JHTaskCreateFormView(retreatId: retreatId) { Task { await load(); showCreate = false } }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let res = try await api.listTasks(
                retreatId: retreatId,
                slotId: nil,
                unassignedOnly: filterUnassigned ? true : nil,
                underassignedOnly: filterUnderassigned ? true : nil
            )
            await MainActor.run { items = res.items; error = nil }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct JHTaskDetailView: View {
    let retreatId: String
    let taskId: String
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var detail: JHTaskDetail?
    @State private var error: String?
    @State private var showEdit = false
    @State private var showDuplicate = false
    @State private var confirmDelete = false
    @State private var showAssign = false

    var body: some View {
        Group {
            if let error { Text(error).foregroundStyle(.red) }
            else if let d = detail {
                List {
                    if let job = d.job {
                        Section("Job") {
                            Text(job.title)
                            Text("Need \(job.volunteersNeeded)")
                        }
                    }
                    if let slot = d.slot {
                        Section("Slot") {
                            Text(slot.label)
                            Text("\(slot.slotDate) · \(slot.timeBand.rawValue)")
                        }
                    }
                    Section("Notes") {
                        Text(d.notes ?? "—")
                    }
                    Section("Assignments") {
                        if let assigns = d.assignments, !assigns.isEmpty {
                            ForEach(assigns) { a in
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(a.volunteer?.displayName ?? a.volunteerId)
                                        Text(a.id).font(.caption2.monospaced()).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Button("Remove", role: .destructive) {
                                        Task { await removeAssignment(a.id) }
                                    }
                                    .buttonStyle(.borderless)
                                }
                            }
                        } else {
                            Text("None")
                        }
                        Button("Assign volunteer…") { showAssign = true }
                    }
                    Section {
                        Button("Edit task") { showEdit = true }
                        Button("Duplicate to another slot…") { showDuplicate = true }
                        Button("Delete task", role: .destructive) { confirmDelete = true }
                    }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Task")
        .task { await load() }
        .sheet(isPresented: $showEdit) {
            if let d = detail {
                NavigationStack {
                    JHTaskEditFormView(retreatId: retreatId, task: d) { Task { await load(); showEdit = false } }
                }
            }
        }
        .sheet(isPresented: $showDuplicate) {
            if let d = detail {
                NavigationStack {
                    JHTaskDuplicateFormView(retreatId: retreatId, taskId: d.id) { Task { await load(); showDuplicate = false } }
                }
            }
        }
        .sheet(isPresented: $showAssign) {
            if let d = detail {
                NavigationStack {
                    AssignmentCreateFormView(retreatId: retreatId, taskId: d.id) { Task { await load(); showAssign = false } }
                }
            }
        }
        .confirmationDialog("Delete task?", isPresented: $confirmDelete) {
            Button("Delete", role: .destructive) { Task { await deleteTask() } }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func load() async {
        do {
            let d = try await api.getTask(retreatId: retreatId, taskId: taskId)
            await MainActor.run { detail = d; error = nil }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func deleteTask() async {
        do {
            try await api.deleteTask(retreatId: retreatId, taskId: taskId)
            await MainActor.run { dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func removeAssignment(_ assignmentId: String) async {
        do {
            try await api.deleteAssignment(retreatId: retreatId, assignmentId: assignmentId)
            await load()
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct JHTaskCreateFormView: View {
    let retreatId: String
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var jobs: [Job] = []
    @State private var slots: [Slot] = []
    @State private var jobId = ""
    @State private var slotId = ""
    @State private var notes = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            Picker("Job", selection: $jobId) {
                Text("—").tag("")
                ForEach(jobs) { j in
                    Text(j.title).tag(j.id)
                }
            }
            Picker("Slot", selection: $slotId) {
                Text("—").tag("")
                ForEach(slots) { s in
                    Text("\(s.label) (\(s.slotDate))").tag(s.id)
                }
            }
            TextField("Notes (optional)", text: $notes)
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("New task")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") { Task { await save() } }.disabled(busy || jobId.isEmpty || slotId.isEmpty)
            }
        }
        .task { await loadPickers() }
    }

    private func loadPickers() async {
        do {
            async let j = api.listJobs(retreatId: retreatId)
            async let s = api.listSlots(retreatId: retreatId, date: nil)
            let (jr, sr) = try await (j, s)
            await MainActor.run {
                jobs = jr.items
                slots = sr.items
            }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            var body = JHTaskCreate(jobId: jobId, slotId: slotId, notes: nil)
            if !notes.isEmpty { body.notes = notes }
            _ = try await api.createTask(retreatId: retreatId, body: body)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct JHTaskEditFormView: View {
    let retreatId: String
    let task: JHTaskDetail
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var slots: [Slot] = []
    @State private var slotId: String
    @State private var notes: String
    @State private var error: String?
    @State private var busy = false

    init(retreatId: String, task: JHTaskDetail, onDone: @escaping () -> Void) {
        self.retreatId = retreatId
        self.task = task
        self.onDone = onDone
        _slotId = State(initialValue: task.slotId)
        _notes = State(initialValue: task.notes ?? "")
    }

    var body: some View {
        Form {
            Picker("Slot", selection: $slotId) {
                ForEach(slots) { s in
                    Text("\(s.label) (\(s.slotDate))").tag(s.id)
                }
            }
            TextField("Notes", text: $notes)
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Edit task")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }.disabled(busy)
            }
        }
        .task { await loadSlots() }
    }

    private func loadSlots() async {
        do {
            let sr = try await api.listSlots(retreatId: retreatId, date: nil)
            await MainActor.run { slots = sr.items }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            var patch = JHTaskPatch()
            patch.slotId = slotId
            patch.notes = notes.isEmpty ? nil : notes
            _ = try await api.updateTask(retreatId: retreatId, taskId: task.id, patch: patch)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct JHTaskDuplicateFormView: View {
    let retreatId: String
    let taskId: String
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var slots: [Slot] = []
    @State private var slotId = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            Picker("Target slot", selection: $slotId) {
                Text("—").tag("")
                ForEach(slots) { s in
                    Text("\(s.label) (\(s.slotDate))").tag(s.id)
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Duplicate task")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Duplicate") { Task { await dup() } }.disabled(busy || slotId.isEmpty)
            }
        }
        .task {
            if let sr = try? await api.listSlots(retreatId: retreatId, date: nil) {
                await MainActor.run { slots = sr.items }
            }
        }
    }

    private func dup() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            _ = try await api.duplicateTask(retreatId: retreatId, taskId: taskId, newSlotId: slotId)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct AssignmentCreateFormView: View {
    let retreatId: String
    let taskId: String
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var linked: [RetreatVolunteer] = []
    @State private var volunteerId = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            Picker("Volunteer", selection: $volunteerId) {
                Text("—").tag("")
                ForEach(linked) { rv in
                    Text(rv.volunteer.displayName).tag(rv.volunteerId)
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("New assignment")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Assign") { Task { await save() } }.disabled(busy || volunteerId.isEmpty)
            }
        }
        .task {
            if let res = try? await api.listRetreatVolunteers(retreatId: retreatId) {
                await MainActor.run { linked = res.items }
            }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            _ = try await api.createAssignment(
                retreatId: retreatId,
                taskId: taskId,
                body: AssignmentCreate(volunteerId: volunteerId)
            )
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Retreat volunteers

struct RetreatVolunteerListView: View {
    let retreatId: String
    private let api = JewelHeartAPI()
    @State private var items: [RetreatVolunteer] = []
    @State private var error: String?
    @State private var showLink = false
    @State private var showImport = false
    @State private var importAlertText: String?

    var body: some View {
        Group {
            if let error { Text(error).foregroundStyle(.red) }
            else {
                List(items) { rv in
                    VStack(alignment: .leading) {
                        Text(rv.volunteer.displayName).font(.headline)
                        if let e = rv.volunteer.email { Text(e).font(.caption).foregroundStyle(.secondary) }
                    }
                    .swipeActions {
                        Button("Unlink", role: .destructive) {
                            Task { await unlink(rv.volunteerId) }
                        }
                    }
                }
            }
        }
        .navigationTitle("Retreat volunteers")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack {
                    Button {
                        showLink = true
                    } label: {
                        Image(systemName: "link")
                    }
                    Button {
                        showImport = true
                    } label: {
                        Image(systemName: "square.and.arrow.down")
                    }
                }
            }
            ToolbarItem(placement: .topBarLeading) {
                Button("Reload") { Task { await load() } }
            }
        }
        .sheet(isPresented: $showLink) {
            NavigationStack {
                LinkVolunteerSearchView(retreatId: retreatId) { Task { await load(); showLink = false } }
            }
        }
        .sheet(isPresented: $showImport) {
            NavigationStack {
                CsvImportView(retreatId: retreatId) { summary in
                    Task { await load() }
                    showImport = false
                    importAlertText = summary
                }
            }
        }
        .alert("Import result", isPresented: Binding(
            get: { importAlertText != nil },
            set: { if !$0 { importAlertText = nil } }
        )) {
            Button("OK") { importAlertText = nil }
        } message: {
            Text(importAlertText ?? "")
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let res = try await api.listRetreatVolunteers(retreatId: retreatId)
            await MainActor.run { items = res.items; error = nil }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func unlink(_ volunteerId: String) async {
        do {
            try await api.unlinkRetreatVolunteer(retreatId: retreatId, volunteerId: volunteerId)
            await load()
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct LinkVolunteerSearchView: View {
    let retreatId: String
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [Volunteer] = []
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        List(results) { v in
            Button {
                Task { await link(v) }
            } label: {
                VStack(alignment: .leading) {
                    Text(v.displayName)
                    if let e = v.email { Text(e).font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
        .searchable(text: $query, prompt: "Name or email")
        .navigationTitle("Link volunteer")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Done") { onDone(); dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Search") { Task { await search() } }.disabled(busy)
            }
        }
        if let error { Text(error).foregroundStyle(.red).padding() }
    }

    private func search() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            let res = try await api.searchVolunteers(q: query, limit: 50)
            await MainActor.run { results = res.items }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func link(_ v: Volunteer) async {
        do {
            _ = try await api.linkRetreatVolunteer(retreatId: retreatId, volunteerId: v.id)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct CsvImportView: View {
    let retreatId: String
    var onImported: (String) -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var showPicker = false
    @State private var error: String?

    var body: some View {
        Form {
            Button("Choose CSV file…") { showPicker = true }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Import CSV")
        .fileImporter(
            isPresented: $showPicker,
            allowedContentTypes: [.commaSeparatedText, .plainText],
            allowsMultipleSelection: false
        ) { result in
            Task { await handleImport(result) }
        }
    }

    private func handleImport(_ result: Result<[URL], Error>) async {
        switch result {
        case .failure(let e):
            await MainActor.run { error = e.localizedDescription }
        case .success(let urls):
            guard let url = urls.first else { return }
            do {
                let accessed = url.startAccessingSecurityScopedResource()
                defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                let data = try Data(contentsOf: url)
                let name = url.lastPathComponent
                let res = try await api.importRetreatVolunteersCsv(retreatId: retreatId, csvData: data, filename: name)
                let msg = "created \(res.created), updated \(res.updated), linked \(res.linked), errors \(res.errors.count)"
                await MainActor.run {
                    onImported(msg)
                    dismiss()
                }
            } catch {
                await MainActor.run { self.error = error.localizedDescription }
            }
        }
    }
}

// MARK: - Global volunteers

struct GlobalVolunteersAdminView: View {
    private let api = JewelHeartAPI()
    @State private var query = ""
    @State private var items: [Volunteer] = []
    @State private var error: String?
    @State private var showCreate = false

    var body: some View {
        Group {
            if let error { Text(error).foregroundStyle(.red) }
            else {
                List(items) { v in
                    NavigationLink(value: v) {
                        VStack(alignment: .leading) {
                            Text(v.displayName)
                            if let e = v.email { Text(e).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
            }
        }
        .navigationTitle("Volunteers")
        .searchable(text: $query, prompt: "Name or email")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack {
                    Button("Search") { Task { await search() } }
                    Button {
                        showCreate = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .navigationDestination(for: Volunteer.self) { v in
            VolunteerDetailView(volunteer: v)
        }
        .task { await search() }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                VolunteerCreateFormView { showCreate = false }
            }
        }
    }

    private func search() async {
        do {
            let res = try await api.searchVolunteers(q: query.isEmpty ? nil : query, limit: 100)
            await MainActor.run { items = res.items; error = nil }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct VolunteerDetailView: View {
    let volunteer: Volunteer
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var showEdit = false
    @State private var confirmDelete = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                if let e = volunteer.email { LabeledContent("Email") { Text(e) } }
                if let p = volunteer.phone { LabeledContent("Phone") { Text(p) } }
                if let o = volunteer.otherDuties { LabeledContent("Other") { Text(o) } }
            }
            Section {
                Button("Edit") { showEdit = true }
                Button("Delete", role: .destructive) { confirmDelete = true }
            }
        }
        .navigationTitle(volunteer.displayName)
        .sheet(isPresented: $showEdit) {
            NavigationStack {
                VolunteerEditFormView(volunteer: volunteer) { showEdit = false }
            }
        }
        .confirmationDialog("Delete volunteer?", isPresented: $confirmDelete) {
            Button("Delete", role: .destructive) { Task { await deleteV() } }
            Button("Cancel", role: .cancel) {}
        }
        if let error { Text(error).foregroundStyle(.red) }
    }

    private func deleteV() async {
        do {
            try await api.deleteVolunteer(volunteerId: volunteer.id)
            await MainActor.run { dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct VolunteerCreateFormView: View {
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var displayName = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var other = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            TextField("Display name", text: $displayName)
            TextField("Email (optional)", text: $email)
            TextField("Phone (optional)", text: $phone)
            TextField("Other duties (optional)", text: $other)
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("New volunteer")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") { Task { await save() } }.disabled(busy || displayName.isEmpty)
            }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            var body = VolunteerCreate(displayName: displayName, email: nil, phone: nil, otherDuties: nil)
            if !email.isEmpty { body.email = email }
            if !phone.isEmpty { body.phone = phone }
            if !other.isEmpty { body.otherDuties = other }
            _ = try await api.createVolunteer(body)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

struct VolunteerEditFormView: View {
    let volunteer: Volunteer
    var onDone: () -> Void
    private let api = JewelHeartAPI()
    @Environment(\.dismiss) private var dismiss
    @State private var displayName: String
    @State private var email: String
    @State private var phone: String
    @State private var other: String
    @State private var error: String?
    @State private var busy = false

    init(volunteer: Volunteer, onDone: @escaping () -> Void) {
        self.volunteer = volunteer
        self.onDone = onDone
        _displayName = State(initialValue: volunteer.displayName)
        _email = State(initialValue: volunteer.email ?? "")
        _phone = State(initialValue: volunteer.phone ?? "")
        _other = State(initialValue: volunteer.otherDuties ?? "")
    }

    var body: some View {
        Form {
            TextField("Display name", text: $displayName)
            TextField("Email", text: $email)
            TextField("Phone", text: $phone)
            TextField("Other duties", text: $other)
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Edit volunteer")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }.disabled(busy)
            }
        }
    }

    private func save() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            var patch = VolunteerPatch()
            patch.displayName = displayName
            patch.email = email.isEmpty ? nil : email
            patch.phone = phone.isEmpty ? nil : phone
            patch.otherDuties = other.isEmpty ? nil : other
            _ = try await api.updateVolunteer(volunteerId: volunteer.id, patch: patch)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Schedule + reports

struct ScheduleDayView: View {
    let retreatId: String
    private let api = JewelHeartAPI()
    @State private var day = Date()
    @State private var response: ScheduleDayResponse?
    @State private var error: String?

    var body: some View {
        List {
            Section {
                DatePicker("Day", selection: $day, displayedComponents: .date)
                Button("Load schedule") { Task { await load() } }
            }
            if let r = response {
                Section("Items (\(r.items.count))") {
                    ForEach(Array(r.items.enumerated()), id: \.offset) { _, item in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.job.title).font(.headline)
                            Text(item.slot.label + " · " + item.slot.slotDate).font(.subheadline)
                            if let notes = item.task.notes, !notes.isEmpty {
                                Text(notes).font(.caption).foregroundStyle(.secondary)
                            }
                            if let assigns = item.assignments, !assigns.isEmpty {
                                Text(assigns.compactMap { $0.volunteer?.displayName ?? $0.volunteerId }.joined(separator: ", "))
                                    .font(.caption2)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle("Schedule")
        if let error { Text(error).foregroundStyle(.red).padding() }
    }

    private func load() async {
        do {
            let d = AdminDayFormat.api.string(from: day)
            let res = try await api.getScheduleByDay(retreatId: retreatId, date: d)
            await MainActor.run { response = res; error = nil }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

private struct ShareURLItem: Identifiable {
    let id = UUID()
    let url: URL
}

struct ReportsView: View {
    let retreatId: String
    private let api = JewelHeartAPI()
    @State private var day = Date()
    @State private var format: DailyReportFormat = .pdf
    @State private var error: String?
    @State private var shareItem: ShareURLItem?

    var body: some View {
        Form {
            DatePicker("Date", selection: $day, displayedComponents: .date)
            Picker("Daily format", selection: $format) {
                ForEach(DailyReportFormat.allCases, id: \.self) { f in
                    Text(f.rawValue).tag(f)
                }
            }
            Section("Poster (PDF)") {
                Button("Download poster PDF") {
                    Task { await fetchPoster() }
                }
            }
            Section("Daily report") {
                Button("Download daily (\(format.rawValue))") {
                    Task { await fetchDaily() }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("Reports")
        .sheet(item: $shareItem) { item in
            ActivityShareSheet(items: [item.url])
        }
    }

    private func writeTemp(_ download: JewelHeartDownload) throws -> URL {
        let dir = FileManager.default.temporaryDirectory
        let url = dir.appendingPathComponent(download.suggestedFilename)
        try download.data.write(to: url, options: .atomic)
        return url
    }

    private func fetchPoster() async {
        await MainActor.run { error = nil }
        do {
            let d = AdminDayFormat.api.string(from: day)
            let dl = try await api.getPosterPdf(retreatId: retreatId, date: d)
            let url = try writeTemp(dl)
            await MainActor.run { shareItem = ShareURLItem(url: url) }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func fetchDaily() async {
        await MainActor.run { error = nil }
        do {
            let d = AdminDayFormat.api.string(from: day)
            let dl = try await api.getDailyReport(retreatId: retreatId, date: d, format: format)
            let url = try writeTemp(dl)
            await MainActor.run { shareItem = ShareURLItem(url: url) }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}
