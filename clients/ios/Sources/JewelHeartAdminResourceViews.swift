import Charts
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
                            Text(r.status.rawValue).font(.caption).foregroundStyle(.secondary)
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
    @State private var status: RetreatStatus = .draft
    @State private var includeDates = false
    @State private var startDate = Date()
    @State private var endDate = Date()
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        Form {
            TextField("Name", text: $name)
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
            var body = RetreatCreate(name: name, timezone: JewelHeartConfig.jewelheartDefaultTimeZoneId, startDate: nil, endDate: nil, status: status)
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
                NavigationLink("Schedule matrix (slot × day)") { ScheduleMatrixView(retreatId: r.id) }
                NavigationLink("Volunteer week (load chart, signup)") { RetreatVolunteerWeekSignupView(retreatId: r.id) }
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
            patch.timezone = JewelHeartConfig.jewelheartDefaultTimeZoneId
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
                    NavigationLink {
                        JobDetailView(retreatId: retreatId, job: j)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(j.title).font(.headline)
                            Text("Need \(j.volunteersNeeded) · \(j.estimatedMinutes) min").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Jobs")
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
                    NavigationLink {
                        SlotDetailView(retreatId: retreatId, slot: s)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(s.label).font(.headline)
                            Text("\(s.slotDate) · \(s.timeBand.rawValue)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Slots")
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
    /// Filled from `listJobs` when the task list payload omits `jobTitle` / `slotLabel` (older API or proxy).
    @State private var jobTitleByJobId: [String: String] = [:]
    @State private var slotLabelBySlotId: [String: String] = [:]
    @State private var error: String?
    @State private var showCreate = false
    @State private var filterUnassigned = false
    @State private var filterUnderassigned = false

    /// Drives `.task(id:)` so changing filters always reloads (more reliable than `onChange` on nested toggles).
    private var taskListFilterKey: String {
        (filterUnassigned ? "1" : "0") + (filterUnderassigned ? "1" : "0")
    }

    var body: some View {
        Group {
            if let error { Text(error).foregroundStyle(.red) }
            else if items.isEmpty, filterUnassigned || filterUnderassigned {
                ContentUnavailableView(
                    "No matching tasks",
                    systemImage: "line.3.horizontal.decrease.circle",
                    description: Text("Try turning off a filter, or add assignments from a task’s detail screen.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(items) { t in
                    NavigationLink {
                        JHTaskDetailView(retreatId: retreatId, taskId: t.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(taskListTitle(t)).font(.headline)
                            if let line = Self.taskListSubtitle(t) {
                                Text(line)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if t.isUnderassigned == true {
                                Text("Still needs volunteers")
                                    .font(.caption2)
                                    .foregroundStyle(.orange)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Tasks")
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
                Toggle(isOn: $filterUnassigned) {
                    Text("Only tasks with no volunteers yet")
                }
                Toggle(isOn: $filterUnderassigned) {
                    Text("Only tasks that still need more people")
                }
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
        .task(id: taskListFilterKey) { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            // Always load the full list, then filter locally so toggles work even if a proxy ignores query params.
            let res = try await api.listTasks(
                retreatId: retreatId,
                slotId: nil,
                unassignedOnly: nil,
                underassignedOnly: nil
            )
            let filtered = Self.applyTaskListFilters(
                res.items,
                unassignedOnly: filterUnassigned,
                underassignedOnly: filterUnderassigned
            )
            async let jobsRes = try? await api.listJobs(retreatId: retreatId)
            async let slotsRes = try? await api.listSlots(retreatId: retreatId)
            let (jr, sr) = await (jobsRes, slotsRes)
            let jMap: [String: String] = (jr?.items ?? []).reduce(into: [:]) { dict, job in
                dict[job.id] = job.title
            }
            let sMap: [String: String] = (sr?.items ?? []).reduce(into: [:]) { dict, slot in
                dict[slot.id] = slot.label
            }
            await MainActor.run {
                items = filtered
                jobTitleByJobId = jMap
                slotLabelBySlotId = sMap
                error = nil
            }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    /// Matches server `listTasks` filters (AND when both are on).
    private static func applyTaskListFilters(
        _ tasks: [JHTask],
        unassignedOnly: Bool,
        underassignedOnly: Bool
    ) -> [JHTask] {
        var out = tasks
        if unassignedOnly {
            out = out.filter { ($0.assignmentCount ?? 0) == 0 }
        }
        if underassignedOnly {
            out = out.filter { t in
                if let need = t.volunteersNeeded {
                    let c = t.assignmentCount ?? 0
                    return c < need
                }
                return t.isUnderassigned == true
            }
        }
        return out
    }

    private func taskListTitle(_ t: JHTask) -> String {
        let jFromTask = t.jobTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let sFromTask = t.slotLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let jFromLookup = jobTitleByJobId[t.jobId]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let sFromLookup = slotLabelBySlotId[t.slotId]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let s = sFromTask.isEmpty ? sFromLookup : sFromTask
        let j = jFromTask.isEmpty ? jFromLookup : jFromTask
        var primary: String = {
            if !j.isEmpty, !s.isEmpty { return "\(j) — \(s)" }
            if !j.isEmpty { return j }
            if !s.isEmpty { return s }
            if let n = t.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !n.isEmpty {
                return n.count > 56 ? String(n.prefix(56)) + "…" : n
            }
            return "Volunteer task"
        }()
        if let ctx = t.slotActivityContext?.trimmingCharacters(in: .whitespacesAndNewlines), !ctx.isEmpty {
            if !primary.localizedCaseInsensitiveContains(ctx) {
                primary = "\(primary) · \(ctx)"
            }
        }
        return primary
    }

    private static func taskListSubtitle(_ t: JHTask) -> String? {
        guard let needed = t.volunteersNeeded else { return nil }
        let c = t.assignmentCount ?? 0
        return "\(c) of \(needed) volunteer spots filled"
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
                            if let ctx = slot.activityContext?.trimmingCharacters(in: .whitespacesAndNewlines), !ctx.isEmpty {
                                Text("Site / context: \(ctx)")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
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
                                        Text(
                                            (a.volunteer?.displayName).flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
                                                ?? "Unnamed volunteer"
                                        )
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
    @State private var didRunInitialLoad = false

    var body: some View {
        Group {
            if busy && results.isEmpty {
                ProgressView("Loading…")
            } else if results.isEmpty, !busy {
                ContentUnavailableView(
                    "No volunteers in this list",
                    systemImage: "person.crop.circle.badge.questionmark",
                    description: Text("Type part of a name or email, then press Go on the keyboard or tap Search in the toolbar. On first open, the app loads recent directory entries (no query).")
                )
            } else {
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
            }
        }
        .searchable(text: $query, prompt: "Name or email")
        .onSubmit(of: .search) {
            Task { await search() }
        }
        .navigationTitle("Link volunteer")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Done") { onDone(); dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Search") { Task { await search() } }.disabled(busy)
            }
        }
        .task {
            if !didRunInitialLoad {
                didRunInitialLoad = true
                await search()
            }
        }
        if let error { Text(error).foregroundStyle(.red).padding() }
    }

    private func search() async {
        await MainActor.run { busy = true; error = nil }
        defer { Task { @MainActor in busy = false } }
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let res = try await api.searchVolunteers(q: trimmed.isEmpty ? nil : trimmed, limit: 100)
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
                    NavigationLink {
                        VolunteerDetailView(volunteer: v)
                    } label: {
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
        .onSubmit(of: .search) {
            Task { await search() }
        }
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
        .task { await search() }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                VolunteerCreateFormView { showCreate = false }
            }
        }
    }

    private func search() async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let res = try await api.searchVolunteers(q: trimmed.isEmpty ? nil : trimmed, limit: 100)
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
    @State private var notifyEmail: Bool
    @State private var notifySms: Bool
    @State private var error: String?
    @State private var busy = false

    init(volunteer: Volunteer, onDone: @escaping () -> Void) {
        self.volunteer = volunteer
        self.onDone = onDone
        _displayName = State(initialValue: volunteer.displayName)
        _email = State(initialValue: volunteer.email ?? "")
        _phone = State(initialValue: volunteer.phone ?? "")
        _other = State(initialValue: volunteer.otherDuties ?? "")
        _notifyEmail = State(initialValue: volunteer.notifyEmail ?? true)
        _notifySms = State(initialValue: volunteer.notifySms ?? false)
    }

    var body: some View {
        Form {
            TextField("Display name", text: $displayName)
            TextField("Email", text: $email)
            TextField("Phone", text: $phone)
            TextField("Other duties", text: $other)
            Toggle("Notify via email", isOn: $notifyEmail)
            Toggle("Notify via SMS", isOn: $notifySms)
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
            patch.notifyEmail = notifyEmail
            patch.notifySms = notifySms
            _ = try await api.updateVolunteer(volunteerId: volunteer.id, patch: patch)
            await MainActor.run { onDone(); dismiss() }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Schedule + reports

/// Slot × day grid (like spreadsheet tab “2. Slot x Day Matrix”): rows = slot label + time band, columns = dates.
/// Cells show job titles for tasks in that slot; tap to open tasks or the slot.
private struct MatrixCellPick: Identifiable {
    let id: String
    let retreatId: String
    let slot: Slot
    let tasks: [JHTask]
    let jobTitleByJobId: [String: String]
}

private struct ScheduleMatrixRow: Identifiable {
    let id: String
    let label: String
    let timeBand: TimeBand
    let sortDate: String
}

/// One date column in the slot × day matrix.
private struct ScheduleMatrixDateColumn: Hashable {
    let columnIndex: Int
    let isoDate: String
}

private func scheduleMatrixColumnTitle(iso: String) -> String {
    guard let d = AdminDayFormat.api.date(from: iso) else { return iso }
    let f = DateFormatter()
    f.locale = Locale.current
    f.setLocalizedDateFormatFromTemplate("EEE M/d")
    return f.string(from: d)
}

/// Builds date columns with UIKit (`for` loop) so we never hit SwiftUI `ForEach` overload-resolution bugs on newer SDKs.
private struct ScheduleMatrixDateColumnsStack: UIViewRepresentable {
    enum Mode {
        case header
        case body(row: ScheduleMatrixRow)
    }

    let columns: [ScheduleMatrixDateColumn]
    let mode: Mode
    let slots: [Slot]
    let tasks: [JHTask]
    let jobTitleByJobId: [String: String]
    let retreatId: String
    let dataColumnWidth: CGFloat
    let onPick: (MatrixCellPick) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick)
    }

    final class Coordinator {
        let onPick: (MatrixCellPick) -> Void
        weak var stack: UIStackView?

        init(onPick: @escaping (MatrixCellPick) -> Void) {
            self.onPick = onPick
        }
    }

    func makeUIView(context: Context) -> UIScrollView {
        let scroll = UIScrollView()
        scroll.showsHorizontalScrollIndicator = true
        scroll.alwaysBounceHorizontal = true
        scroll.clipsToBounds = true
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.alignment = .fill
        stack.spacing = 0
        stack.distribution = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            stack.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor),
        ])
        context.coordinator.stack = stack
        return scroll
    }

    func updateUIView(_ scroll: UIScrollView, context: Context) {
        guard let stack = context.coordinator.stack else { return }
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }

        let sep = UIColor.separator

        for (i, col) in columns.enumerated() {
            if i > 0 {
                let rule = UIView()
                rule.backgroundColor = sep
                rule.translatesAutoresizingMaskIntoConstraints = false
                rule.widthAnchor.constraint(equalToConstant: 1).isActive = true
                stack.addArrangedSubview(rule)
            }

            let box = UIView()
            box.translatesAutoresizingMaskIntoConstraints = false
            box.widthAnchor.constraint(equalToConstant: dataColumnWidth).isActive = true

            switch mode {
            case .header:
                box.backgroundColor = UIColor.secondarySystemGroupedBackground
                let lab = UILabel()
                lab.numberOfLines = 2
                lab.textAlignment = .center
                let baseCaption = UIFont.preferredFont(forTextStyle: .caption1)
                if let d = baseCaption.fontDescriptor.withSymbolicTraits(.traitBold) {
                    lab.font = UIFont(descriptor: d, size: 0)
                } else {
                    lab.font = baseCaption
                }
                lab.textColor = .label
                lab.text = scheduleMatrixColumnTitle(iso: col.isoDate)
                lab.translatesAutoresizingMaskIntoConstraints = false
                box.addSubview(lab)
                NSLayoutConstraint.activate([
                    lab.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 8),
                    lab.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -8),
                    lab.topAnchor.constraint(equalTo: box.topAnchor, constant: 10),
                    lab.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -10),
                ])
            case .body(let row):
                let slot = slots.first { $0.label == row.label && $0.timeBand == row.timeBand && $0.slotDate == col.isoDate }
                let cellTasks: [JHTask] = {
                    guard let slot else { return [] }
                    return tasks.filter { $0.slotId == slot.id }
                }()
                let summary = Self.bodySummary(tasks: cellTasks, jobTitleByJobId: jobTitleByJobId)
                let btn = UIButton(type: .system)
                var cfg = UIButton.Configuration.bordered()
                cfg.title = summary
                cfg.titleLineBreakMode = .byWordWrapping
                cfg.baseForegroundColor = .label
                cfg.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8)
                btn.configuration = cfg
                btn.titleLabel?.numberOfLines = 6
                btn.titleLabel?.textAlignment = .left
                btn.translatesAutoresizingMaskIntoConstraints = false
                btn.isEnabled = slot != nil
                if let slot {
                    let pick = MatrixCellPick(
                        id: slot.id,
                        retreatId: retreatId,
                        slot: slot,
                        tasks: cellTasks,
                        jobTitleByJobId: jobTitleByJobId
                    )
                    btn.addAction(UIAction { _ in context.coordinator.onPick(pick) }, for: .touchUpInside)
                } else {
                    var emptyCfg = UIButton.Configuration.plain()
                    emptyCfg.title = "—"
                    emptyCfg.baseForegroundColor = .tertiaryLabel
                    btn.configuration = emptyCfg
                    btn.isEnabled = false
                }
                box.addSubview(btn)
                NSLayoutConstraint.activate([
                    btn.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 4),
                    btn.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -4),
                    btn.topAnchor.constraint(equalTo: box.topAnchor, constant: 4),
                    btn.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -4),
                ])
            }
            stack.addArrangedSubview(box)
        }
    }

    private static func bodySummary(tasks: [JHTask], jobTitleByJobId: [String: String]) -> String {
        if tasks.isEmpty {
            return "No tasks yet\nTap for slot"
        }
        let lines = tasks.prefix(3).map { jobTitleByJobId[$0.jobId] ?? $0.jobTitle ?? "Task" }
        var s = lines.joined(separator: "\n")
        if tasks.count > 3 {
            s += "\n+\(tasks.count - 3) more"
        }
        return s
    }
}

private func retreatMatrixGregorianUTC() -> Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(secondsFromGMT: 0)!
    return c
}

/// Calendar-style navigator from first…last slot date (SwiftUI only; no third-party calendar package). Tap a day that has slots to focus the matrix.
private struct RetreatScheduleMatrixCalendarNavigator: View {
    let dates: [String]
    let slots: [Slot]
    @Binding var matrixFocusedDay: String?

    private var calendar: Calendar { retreatMatrixGregorianUTC() }

    private var slotDaySet: Set<String> { Set(dates) }

    private var slotsPerDay: [String: Int] {
        Dictionary(grouping: slots, by: \.slotDate).mapValues(\.count)
    }

    private var dayISOSequence: [String] {
        guard let first = dates.first,
              let last = dates.last,
              let d0 = AdminDayFormat.api.date(from: first),
              let d1 = AdminDayFormat.api.date(from: last)
        else { return [] }
        let start = min(d0, d1)
        let end = max(d0, d1)
        let cal = calendar
        var out: [String] = []
        var d = cal.startOfDay(for: start)
        let endDay = cal.startOfDay(for: end)
        while d <= endDay {
            out.append(AdminDayFormat.api.string(from: d))
            guard let next = cal.date(byAdding: .day, value: 1, to: d) else { break }
            d = next
        }
        return out
    }

    private var weekdaySymbols: [String] {
        let df = DateFormatter()
        df.locale = .current
        return df.shortWeekdaySymbols
    }

    private var paddedDayCells: [(iso: String, id: Int)] {
        let seq = dayISOSequence
        guard let firstIso = seq.first, let firstDate = AdminDayFormat.api.date(from: firstIso) else { return [] }
        let weekday = calendar.component(.weekday, from: firstDate)
        let padding = max(0, weekday - 1)
        var out: [(String, Int)] = []
        var id = 0
        for _ in 0..<padding {
            out.append(("", id))
            id += 1
        }
        for iso in seq {
            out.append((iso, id))
            id += 1
        }
        return out
    }

    var body: some View {
        Group {
            if dayISOSequence.isEmpty {
                EmptyView()
            } else {
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 0) {
                            ForEach(weekdaySymbols.indices, id: \.self) { i in
                                Text(weekdaySymbols[i])
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 6) {
                            ForEach(paddedDayCells, id: \.id) { cell in
                                if cell.iso.isEmpty {
                                    Color.clear.frame(minHeight: 44)
                                } else {
                                    dayCell(iso: cell.iso)
                                }
                            }
                        }
                    }
                    .padding(10)
                }
                .frame(maxHeight: 360)
                .background(Color(uiColor: .secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    @ViewBuilder
    private func dayCell(iso: String) -> some View {
        let count = slotsPerDay[iso, default: 0]
        let hasSlots = slotDaySet.contains(iso) && count > 0
        let selected = matrixFocusedDay == iso
        let dayNum: Int = {
            guard let d = AdminDayFormat.api.date(from: iso) else { return 0 }
            return calendar.component(.day, from: d)
        }()
        Button {
            if hasSlots { matrixFocusedDay = iso }
        } label: {
            VStack(spacing: 2) {
                Text("\(dayNum)")
                    .font(.system(size: 15, weight: selected ? .semibold : .regular))
                if count > 0 {
                    Text("\(count)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .center)
            .foregroundStyle(hasSlots ? Color.primary : Color.secondary.opacity(0.45))
            .overlay {
                if selected {
                    RoundedRectangle(cornerRadius: 7)
                        .strokeBorder(Color.accentColor, lineWidth: 2)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(!hasSlots)
    }
}

struct ScheduleMatrixView: View {
    let retreatId: String
    private let api = JewelHeartAPI()
    @State private var dates: [String] = []
    @State private var rows: [ScheduleMatrixRow] = []
    @State private var slots: [Slot] = []
    @State private var tasks: [JHTask] = []
    @State private var jobTitleByJobId: [String: String] = [:]
    @State private var error: String?
    @State private var pick: MatrixCellPick?
    @State private var dateColumnsForGrid: [ScheduleMatrixDateColumn] = []
    /// When set, the matrix shows only this column (must be a `slotDate` present on the retreat).
    @State private var matrixFocusedDay: String?
    @State private var horizonCalendarRedrawToken = 0

    /// Fixed widths so columns line up like a spreadsheet; separators read as grid lines.
    private let rowHeaderWidth: CGFloat = 168
    private let dataColumnWidth: CGFloat = 118
    private var gridLine: Color { Color(uiColor: .separator) }
    private var headerFill: Color { Color(uiColor: .secondarySystemGroupedBackground) }
    private var rowStripe: Color { Color(uiColor: .tertiarySystemGroupedBackground).opacity(0.45) }

    private var dateColumnsForDisplay: [ScheduleMatrixDateColumn] {
        if let f = matrixFocusedDay, dates.contains(f) {
            return [ScheduleMatrixDateColumn(columnIndex: 0, isoDate: f)]
        }
        return dateColumnsForGrid
    }

    var body: some View {
        Group {
            if let error {
                ContentUnavailableView("Couldn’t load matrix", systemImage: "calendar", description: Text(error))
            } else if dates.isEmpty {
                ContentUnavailableView(
                    "No slots yet",
                    systemImage: "calendar.badge.plus",
                    description: Text("Add slots for this retreat, then tasks. The matrix uses slot dates as columns.")
                )
            } else {
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Retreat dates")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 4)
                        RetreatScheduleMatrixCalendarNavigator(
                            dates: dates,
                            slots: slots,
                            matrixFocusedDay: $matrixFocusedDay
                        )
                        .id(horizonCalendarRedrawToken)
                        matrixFocusCaption
                        ScrollView([.horizontal, .vertical]) {
                            VStack(alignment: .leading, spacing: 0) {
                                matrixHeaderRow
                                matrixDivider
                                ForEach(Array(rows.enumerated()), id: \.element.id) { pair in
                                    matrixBodyRow(row: pair.element, stripe: pair.offset.isMultiple(of: 2))
                                    matrixDivider
                                }
                            }
                            .padding(12)
                        }
                        .background(Color(uiColor: .systemGroupedBackground))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 8)
                }
                .background(Color(uiColor: .systemGroupedBackground))
            }
        }
        .navigationTitle("Slot × day")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 12) {
                    if matrixFocusedDay != nil {
                        Button("All days") { matrixFocusedDay = nil }
                    }
                    Button("Reload") { Task { await load() } }
                }
            }
        }
        .task(id: retreatId) { await load() }
        .refreshable { await load() }
        .sheet(item: $pick) { p in
            NavigationStack {
                List {
                    Section("This cell") {
                        LabeledContent("Slot") { Text(p.slot.label) }
                        LabeledContent("Date") { Text(p.slot.slotDate) }
                        LabeledContent("Time band") { Text(p.slot.timeBand.rawValue) }
                    }
                    Section {
                        NavigationLink("Open slot details") {
                            SlotDetailView(retreatId: p.retreatId, slot: p.slot)
                        }
                    }
                    if p.tasks.isEmpty {
                        Section {
                            Text("No tasks linked to this slot yet. Add one from the Tasks screen (pick job and this slot), after jobs and slots exist.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Section("Tasks (\(p.tasks.count))") {
                            ForEach(p.tasks, id: \.id) { t in
                                NavigationLink {
                                    JHTaskDetailView(retreatId: p.retreatId, taskId: t.id)
                                } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(p.jobTitleByJobId[t.jobId] ?? "Volunteer task")
                                            .font(.body)
                                        Text("\(t.assignmentCount ?? 0) / \(t.volunteersNeeded ?? 0) filled")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
                .navigationTitle("Cell")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { pick = nil }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var matrixHeaderRow: some View {
        HStack(alignment: .top, spacing: 0) {
            Text("Slot / time")
                .font(.caption.weight(.semibold))
                .frame(width: rowHeaderWidth, alignment: .leading)
                .padding(10)
                .frame(minHeight: 44, alignment: .topLeading)
                .background(headerFill)
            matrixVRule
            ScheduleMatrixDateColumnsStack(
                columns: dateColumnsForDisplay,
                mode: .header,
                slots: slots,
                tasks: tasks,
                jobTitleByJobId: jobTitleByJobId,
                retreatId: retreatId,
                dataColumnWidth: dataColumnWidth,
                onPick: { _ in }
            )
            .frame(height: 44)
        }
    }

    private var matrixVRule: some View {
        Rectangle()
            .fill(gridLine)
            .frame(width: 1)
            .frame(maxHeight: .infinity)
    }

    private var matrixDivider: some View {
        Rectangle()
            .fill(gridLine)
            .frame(height: 1)
    }

    @ViewBuilder
    private func matrixBodyRow(row: ScheduleMatrixRow, stripe: Bool) -> some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(row.label)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Text(row.timeBand.rawValue.capitalized)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(width: rowHeaderWidth, alignment: .topLeading)
            .padding(10)
            .frame(minHeight: 56, alignment: .topLeading)
            matrixVRule
            ScheduleMatrixDateColumnsStack(
                columns: dateColumnsForDisplay,
                mode: .body(row: row),
                slots: slots,
                tasks: tasks,
                jobTitleByJobId: jobTitleByJobId,
                retreatId: retreatId,
                dataColumnWidth: dataColumnWidth,
                onPick: { pick = $0 }
            )
            .frame(height: 68)
        }
        .background(stripe ? rowStripe : Color.clear)
    }

    @ViewBuilder
    private var matrixFocusCaption: some View {
        if let f = matrixFocusedDay, dates.contains(f) {
            HStack(alignment: .firstTextBaseline) {
                Text("Matrix: \(scheduleMatrixColumnTitle(iso: f)) · \(f)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                Button("Clear") { matrixFocusedDay = nil }
                    .font(.caption.weight(.semibold))
            }
            .padding(.horizontal, 4)
        } else {
            Text("Tap a day that shows a slot count to focus that column in the matrix below.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
        }
    }

    private func load() async {
        do {
            let sl = try await api.listSlots(retreatId: retreatId)
            let tk = try await api.listTasks(retreatId: retreatId, slotId: nil, unassignedOnly: nil, underassignedOnly: nil)
            let jb = try await api.listJobs(retreatId: retreatId)
            let jm = Dictionary(uniqueKeysWithValues: jb.items.map { ($0.id, $0.title) })
            let slotItems = sl.items
            let dateCols = Array(Set(slotItems.map(\.slotDate))).sorted()
            let grouped = Dictionary(grouping: slotItems) { "\($0.label)|\($0.timeBand.rawValue)" }
            let rowModels: [ScheduleMatrixRow] = grouped.values.compactMap { group in
                guard let any = group.first else { return nil }
                let minD = group.map(\.slotDate).min() ?? any.slotDate
                return ScheduleMatrixRow(
                    id: "\(any.label)|\(any.timeBand.rawValue)",
                    label: any.label,
                    timeBand: any.timeBand,
                    sortDate: minD
                )
            }
            .sorted { a, b in
                if a.sortDate != b.sortDate { return a.sortDate < b.sortDate }
                let ia = TimeBand.allCases.firstIndex(of: a.timeBand) ?? 0
                let ib = TimeBand.allCases.firstIndex(of: b.timeBand) ?? 0
                if ia != ib { return ia < ib }
                return a.label.localizedCaseInsensitiveCompare(b.label) == .orderedAscending
            }
            await MainActor.run {
                slots = slotItems
                tasks = tk.items
                jobTitleByJobId = jm
                dates = dateCols
                rows = rowModels
                dateColumnsForGrid = dateCols.enumerated().map { ScheduleMatrixDateColumn(columnIndex: $0.offset, isoDate: $0.element) }
                if let f = matrixFocusedDay, !dateCols.contains(f) {
                    matrixFocusedDay = nil
                }
                horizonCalendarRedrawToken &+= 1
                error = nil
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                dateColumnsForGrid = []
            }
        }
    }
}

// MARK: - Volunteer self-service (week + filters + sign up / leave)

/// Persisted volunteer profile id for self-signup flows (same device; admin links this volunteer to each retreat).
private enum VolunteerSelfServiceStorage {
    static let selfVolunteerIdKey = "jewelheart.selfVolunteerId"
}

struct VolunteerSelfServiceRootView: View {
    private let api = JewelHeartAPI()
    @State private var retreats: [Retreat] = []
    @State private var error: String?

    var body: some View {
        Group {
            if let error {
                ContentUnavailableView("Couldn’t load retreats", systemImage: "exclamationmark.triangle", description: Text(error))
            } else if retreats.isEmpty {
                ContentUnavailableView("No retreats", systemImage: "mountain.2", description: Text("Pull to refresh after an admin grants access."))
            } else {
                List(retreats) { r in
                    Section(r.name) {
                        NavigationLink("Volunteer week") {
                            RetreatVolunteerWeekSignupView(retreatId: r.id)
                        }
                        // Use the tab’s outer `NavigationStack` only. A nested stack here caused the Messages
                        // push to pop back to this list when `RetreatMessagingListView` swapped loading UI
                        // for the conversation list (two stacks fighting over path updates).
                        NavigationLink("Messages") {
                            RetreatMessagingListView(retreatId: r.id)
                        }
                    }
                }
            }
        }
        .navigationTitle("Volunteer")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Reload") { Task { await load() } }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        await MainActor.run { error = nil }
        do {
            let res = try await api.listRetreats(cursor: nil, limit: 100)
            await MainActor.run { retreats = res.items }
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }
}

private func retreatCalendar(timezoneId: String) -> Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: timezoneId)
        ?? TimeZone(identifier: JewelHeartConfig.jewelheartDefaultTimeZoneId)
        ?? .gmt
    return c
}

/// Monday-start week containing `date` (calendar’s `firstWeekday` is ignored for predictable week boundaries).
private func volunteerWeekMonday(containing date: Date, calendar: Calendar) -> Date {
    let start = calendar.startOfDay(for: date)
    let weekday = calendar.component(.weekday, from: start)
    let daysFromMonday = (weekday + 5) % 7
    return calendar.date(byAdding: .day, value: -daysFromMonday, to: start) ?? start
}

/// Slot/API `yyyy-MM-dd` from a `Date` in `calendar`’s timezone (avoids UTC vs local day drift).
private func volunteerApiDayString(from date: Date, calendar: Calendar) -> String {
    let y = calendar.component(.year, from: date)
    let m = calendar.component(.month, from: date)
    let d = calendar.component(.day, from: date)
    return String(format: "%04d-%02d-%02d", y, m, d)
}

/// Parse `yyyy-MM-dd` as that **calendar day** in `calendar`’s timezone (noon avoids DST edge cases).
private func volunteerDateAtNoonFromAPIDay(_ iso: String, calendar: Calendar) -> Date? {
    let parts = iso.split(separator: "-").map(String.init)
    guard parts.count == 3,
          let y = Int(parts[0]),
          let m = Int(parts[1]),
          let d = Int(parts[2]) else { return nil }
    return calendar.date(from: DateComponents(year: y, month: m, day: d, hour: 12))
}

private func volunteerWeekDayStrings(monday: Date, calendar: Calendar) -> [String] {
    let start = calendar.startOfDay(for: monday)
    return (0..<7).compactMap { offset -> String? in
        guard let d = calendar.date(byAdding: .day, value: offset, to: start) else { return nil }
        return volunteerApiDayString(from: d, calendar: calendar)
    }
}

private func volunteerWeekDayLabel(iso: String, calendar: Calendar) -> String {
    guard let d = volunteerDateAtNoonFromAPIDay(iso, calendar: calendar) else { return iso }
    let f = DateFormatter()
    f.calendar = calendar
    f.locale = .current
    f.setLocalizedDateFormatFromTemplate("EEE M/d")
    return f.string(from: d)
}

/// Monday of the week to show first when opening volunteer signup (prefers retreat `startDate`, then `endDate`, then today).
private func volunteerSignupInitialWeekMonday(retreat: Retreat, calendar: Calendar) -> Date {
    let now = calendar.startOfDay(for: Date())
    if let startStr = retreat.startDate, let anchor = volunteerDateAtNoonFromAPIDay(startStr, calendar: calendar) {
        return volunteerWeekMonday(containing: anchor, calendar: calendar)
    }
    if let endStr = retreat.endDate, let anchor = volunteerDateAtNoonFromAPIDay(endStr, calendar: calendar) {
        return volunteerWeekMonday(containing: anchor, calendar: calendar)
    }
    return volunteerWeekMonday(containing: now, calendar: calendar)
}

private func apiDateStringsOverlapRange(weekDays: [String], start: String?, end: String?) -> Bool {
    guard let s = start, let e = end, let first = weekDays.first, let last = weekDays.last else { return true }
    return !(last < s || first > e)
}

// MARK: - Volunteer load metrics (demand vs actual signups)

private func volunteerLoadChartAxisLabel(iso: String, calendar: Calendar) -> String {
    guard let d = volunteerDateAtNoonFromAPIDay(iso, calendar: calendar) else { return "?" }
    let f = DateFormatter()
    f.calendar = calendar
    f.locale = .current
    f.setLocalizedDateFormatFromTemplate("EEE d")
    return f.string(from: d)
}

private struct VolunteerDayLoadMetrics: Identifiable {
    let id: String
    let dateISO: String
    let displayLabel: String
    /// Short label for chart x-axis (e.g. "Mon 20") — avoids wide "Mon, 7/20" truncation in Charts.
    let chartAxisLabel: String
    /// Σ (volunteersNeeded × estimatedMinutes) — spreadsheet “total volunteer-minutes” (demand).
    let totalVolunteerMinutesDemand: Int
    /// Σ volunteersNeeded — slots if no one does double duty.
    let volunteerSlotsDemand: Int
    /// Σ (filled slot count × estimatedMinutes) where filled = assignments.count or task.assignmentCount.
    let assignedPersonMinutes: Int
    /// Distinct volunteer IDs with an assignment that day (nil if API omitted assignment rows).
    let distinctVolunteersAssigned: Int?
    let filledSlotCount: Int

    var avgMinutesPerSlotDemand: Double {
        volunteerSlotsDemand > 0 ? Double(totalVolunteerMinutesDemand) / Double(volunteerSlotsDemand) : 0
    }

    /// Avg minutes per **distinct** volunteer (when IDs known); else per filled slot.
    var avgMinutesPerWorkerActual: Double? {
        guard assignedPersonMinutes > 0 else { return nil }
        if let d = distinctVolunteersAssigned, d > 0 {
            return Double(assignedPersonMinutes) / Double(d)
        }
        if filledSlotCount > 0 {
            return Double(assignedPersonMinutes) / Double(filledSlotCount)
        }
        return nil
    }

    var usesSlotFallbackForAvg: Bool {
        (distinctVolunteersAssigned ?? 0) == 0 && filledSlotCount > 0 && assignedPersonMinutes > 0
    }
}

private func volunteerDayLoadMetrics(rows: [ScheduleDayItem], weekDates: [String], calendar: Calendar) -> [VolunteerDayLoadMetrics] {
    let inWeek = rows.filter { weekDates.contains($0.slot.slotDate) }
    let grouped = Dictionary(grouping: inWeek, by: \.slot.slotDate)
    return weekDates.map { iso in
        var seenTask = Set<String>()
        let items = (grouped[iso] ?? []).filter { seenTask.insert($0.task.id).inserted }

        var demandMinutes = 0
        var demandSlots = 0
        var assignedMinutes = 0
        var volunteerIds = Set<String>()
        var filledSlots = 0

        for item in items {
            let need = item.task.volunteersNeeded ?? item.job.volunteersNeeded
            let mins = item.job.estimatedMinutes
            demandMinutes += need * mins
            demandSlots += need

            let assigns = item.assignments ?? []
            let ac = assigns.isEmpty ? (item.task.assignmentCount ?? 0) : assigns.count
            filledSlots += ac
            assignedMinutes += ac * mins
            for a in assigns {
                volunteerIds.insert(a.volunteerId)
            }
        }

        let distinct: Int? = volunteerIds.isEmpty ? nil : volunteerIds.count
        let label = volunteerWeekDayLabel(iso: iso, calendar: calendar)
        let axis = volunteerLoadChartAxisLabel(iso: iso, calendar: calendar)
        return VolunteerDayLoadMetrics(
            id: iso,
            dateISO: iso,
            displayLabel: label,
            chartAxisLabel: axis,
            totalVolunteerMinutesDemand: demandMinutes,
            volunteerSlotsDemand: demandSlots,
            assignedPersonMinutes: assignedMinutes,
            distinctVolunteersAssigned: distinct,
            filledSlotCount: filledSlots
        )
    }
}

/// Segments for a stacked vertical bar chart (one bar per day; total height = demand).
private struct VolunteerWeekPersonMinuteStackSegment: Identifiable {
    let id: String
    let chartAxisLabel: String
    let segment: String
    let minutes: Int
}

private func volunteerWeekPersonMinuteStackSegments(_ metrics: [VolunteerDayLoadMetrics]) -> [VolunteerWeekPersonMinuteStackSegment] {
    metrics.flatMap { m -> [VolunteerWeekPersonMinuteStackSegment] in
        let remaining = max(0, m.totalVolunteerMinutesDemand - m.assignedPersonMinutes)
        return [
            VolunteerWeekPersonMinuteStackSegment(
                id: "\(m.id)-filled",
                chartAxisLabel: m.chartAxisLabel,
                segment: "Filled",
                minutes: m.assignedPersonMinutes
            ),
            VolunteerWeekPersonMinuteStackSegment(
                id: "\(m.id)-need",
                chartAxisLabel: m.chartAxisLabel,
                segment: "Still needed",
                minutes: remaining
            )
        ]
    }
}

struct RetreatVolunteerWeekSignupView: View {
    let retreatId: String
    private let api = JewelHeartAPI()
    @Environment(\.openURL) private var openURL
    @AppStorage(VolunteerSelfServiceStorage.selfVolunteerIdKey) private var selfVolunteerId: String = ""

    @State private var retreat: Retreat?
    @State private var weekMonday: Date = volunteerWeekMonday(containing: Date(), calendar: retreatCalendar(timezoneId: JewelHeartConfig.jewelheartDefaultTimeZoneId))
    @State private var rows: [ScheduleDayItem] = []
    @State private var linkedVolunteers: [RetreatVolunteer] = []
    @State private var error: String?
    @State private var actionError: String?
    @State private var busy = false
    @State private var actingTaskIds: Set<String> = []

    @State private var calendarHttpsUrl: String?
    @State private var calendarWebcalUrl: String?
    @State private var calendarFeedBusy = false
    @State private var calendarFeedError: String?

    @State private var includedSlotLabels: Set<String> = []
    @State private var includedWeekDates: Set<String> = []
    @State private var includedSites: Set<String> = []
    @State private var includedTimeBands: Set<TimeBand> = []
    @State private var includedDurationMinutes: Set<Int> = []

    private var calendar: Calendar {
        retreatCalendar(timezoneId: JewelHeartConfig.jewelheartDefaultTimeZoneId)
    }

    private var weekIsoDays: [String] { volunteerWeekDayStrings(monday: weekMonday, calendar: calendar) }

    private var weekTitle: String {
        guard let a = weekIsoDays.first, let b = weekIsoDays.last else { return "Week" }
        return "\(volunteerWeekDayLabel(iso: a, calendar: calendar)) – \(volunteerWeekDayLabel(iso: b, calendar: calendar))"
    }

    private var uniqueSlotLabels: [String] {
        Array(Set(rows.map(\.slot.label))).sorted()
    }

    /// Site/context for filters and row copy: `slot.activityContext`, then `task.slotActivityContext` (schedule JSON often omits context on the nested slot while the task still carries the matrix site); no `Job` field matches this semantic.
    private func effectiveActivityContext(for item: ScheduleDayItem) -> String {
        if let s = item.slot.activityContext?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty { return s }
        if let s = item.task.slotActivityContext?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty { return s }
        return ""
    }

    private var uniqueSites: [String] {
        let tags = Set(rows.map { item in
            let raw = effectiveActivityContext(for: item)
            return raw.isEmpty ? "—" : raw
        })
        return Array(tags).sorted()
    }

    /// Distinct job `estimatedMinutes` values for this week’s loaded rows (filter options only reflect real data).
    private var uniqueDurationMinutes: [Int] {
        Array(Set(rows.map(\.job.estimatedMinutes))).sorted()
    }

    private var filteredRows: [ScheduleDayItem] {
        rows.filter { item in
            if !includedSlotLabels.isEmpty, !includedSlotLabels.contains(item.slot.label) { return false }
            if !includedWeekDates.isEmpty, !includedWeekDates.contains(item.slot.slotDate) { return false }
            let siteRaw = effectiveActivityContext(for: item)
            let siteTag = siteRaw.isEmpty ? "—" : siteRaw
            if !includedSites.isEmpty, !includedSites.contains(siteTag) { return false }
            if !includedTimeBands.isEmpty, !includedTimeBands.contains(item.slot.timeBand) { return false }
            if !includedDurationMinutes.isEmpty, !includedDurationMinutes.contains(item.job.estimatedMinutes) { return false }
            return true
        }
        .sorted { a, b in
            if a.slot.slotDate != b.slot.slotDate { return a.slot.slotDate < b.slot.slotDate }
            let ia = TimeBand.allCases.firstIndex(of: a.slot.timeBand) ?? 0
            let ib = TimeBand.allCases.firstIndex(of: b.slot.timeBand) ?? 0
            if ia != ib { return ia < ib }
            return a.job.title.localizedCaseInsensitiveCompare(b.job.title) == .orderedAscending
        }
    }

    private var selfIsLinked: Bool {
        guard !selfVolunteerId.isEmpty else { return false }
        return linkedVolunteers.contains { $0.volunteerId == selfVolunteerId }
    }

    private var dayLoadMetrics: [VolunteerDayLoadMetrics] {
        volunteerDayLoadMetrics(rows: rows, weekDates: weekIsoDays, calendar: calendar)
    }

    var body: some View {
        List {
            Section {
                if retreat == nil {
                    ProgressView()
                } else if let r = retreat {
                    Text(r.name).font(.headline)
                    Text("Week boundaries use Eastern Time (US).")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Week") {
                Text(weekTitle).font(.subheadline.weight(.semibold))
                if let r = retreat, !apiDateStringsOverlapRange(weekDays: weekIsoDays, start: r.startDate, end: r.endDate) {
                    Text("These dates are outside this retreat’s configured range (\(r.startDate ?? "—") … \(r.endDate ?? "—")). Use the back arrow or “Jump to retreat start week”.")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
                HStack {
                    Button { shiftWeek(by: -7) } label: { Image(systemName: "chevron.left") }
                    Spacer()
                    Button("Today’s week") { jumpToWeekContainingToday() }
                    Spacer()
                    Button { shiftWeek(by: 7) } label: { Image(systemName: "chevron.right") }
                }
                .disabled(busy)
                if retreat?.startDate != nil {
                    Button("Jump to retreat start week") { jumpToRetreatStartWeek() }
                        .disabled(busy)
                }
            }

            Section("Volunteer load") {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Demand matches the spreadsheet model (each task needs its own volunteers; no double duty). Bars and averages refresh when you sign up or leave a slot.")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if dayLoadMetrics.allSatisfy({ $0.volunteerSlotsDemand == 0 }) {
                        Text("No tasks in this week yet — load shifts or change the week to see metrics.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Person-minutes by day (filled vs still needed)")
                                .font(.caption.weight(.semibold))
                            Chart(volunteerWeekPersonMinuteStackSegments(dayLoadMetrics)) { row in
                                BarMark(
                                    x: .value("Day", row.chartAxisLabel),
                                    y: .value("Minutes", row.minutes)
                                )
                                .foregroundStyle(by: .value("Layer", row.segment))
                            }
                            .chartForegroundStyleScale([
                                "Filled": Color.teal,
                                "Still needed": Color.indigo.opacity(0.4)
                            ])
                            .chartXAxis {
                                AxisMarks(preset: .aligned) { value in
                                    AxisGridLine()
                                    AxisTick()
                                    AxisValueLabel(centered: true) {
                                        if let s = value.as(String.self) {
                                            Text(s)
                                                .font(.caption2)
                                                .lineLimit(2)
                                                .minimumScaleFactor(0.85)
                                                .multilineTextAlignment(.center)
                                                .frame(maxWidth: 44)
                                        }
                                    }
                                }
                            }
                            .chartYAxis(.automatic)
                            .chartLegend(position: .bottom, spacing: 6)
                            .chartPlotStyle { plot in
                                plot.padding(.bottom, 2)
                            }
                            .frame(height: 228)
                        }

                        volunteerLoadMetricsTable
                    }
                }
                .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
            }

            Section("Signing up as") {
                if linkedVolunteers.isEmpty {
                    Text("No volunteers are linked to this retreat yet. Ask an admin to link you under Retreat → Linked volunteers.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Picker("Volunteer profile", selection: $selfVolunteerId) {
                        Text("Choose…").tag("")
                        ForEach(linkedVolunteers, id: \.volunteerId) { rv in
                            Text(rv.volunteer.displayName).tag(rv.volunteer.id)
                        }
                    }
                    if !selfVolunteerId.isEmpty, !selfIsLinked {
                        Text("Pick a volunteer that is linked to this retreat.")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
            }

            Section("Calendar feed") {
                Text("Subscribe in Apple Calendar. The HTTPS URL is a secret — don’t share it publicly.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if calendarFeedBusy {
                    ProgressView()
                }
                if let calendarFeedError {
                    Text(calendarFeedError).foregroundStyle(.red).font(.caption)
                }
                Button("Show subscribe link") {
                    Task { await mintCalendarFeed(regenerate: false) }
                }
                .disabled(!selfIsLinked || selfVolunteerId.isEmpty || calendarFeedBusy)
                Button("Rotate link (invalidate old subscriptions)", role: .destructive) {
                    Task { await mintCalendarFeed(regenerate: true) }
                }
                .disabled(!selfIsLinked || selfVolunteerId.isEmpty || calendarFeedBusy)
                if let https = calendarHttpsUrl {
                    Text(https).font(.caption).textSelection(.enabled)
                    Button("Copy HTTPS URL") {
                        UIPasteboard.general.string = https
                    }
                    Button("Open in Safari") {
                        if let u = URL(string: https) { openURL(u) }
                    }
                }
                if let subscribe = calendarSubscribeWebcalURL() {
                    Button("Subscribe in Calendar") {
                        openURL(subscribe)
                    }
                    Button("Copy subscribe link") {
                        UIPasteboard.general.string = subscribe.absoluteString
                    }
                }
            }

            Section("Filters") {
                Text("Leave a group empty to show all. Otherwise only rows matching every active filter are shown.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                DisclosureGroup("Slot label") {
                    ForEach(uniqueSlotLabels, id: \.self) { label in
                        Toggle(label, isOn: bindingIncluded($includedSlotLabels, label))
                    }
                }
                DisclosureGroup("Day (this week)") {
                    ForEach(weekIsoDays, id: \.self) { iso in
                        Toggle(volunteerWeekDayLabel(iso: iso, calendar: calendar), isOn: bindingIncluded($includedWeekDates, iso))
                    }
                }
                DisclosureGroup("Site / context") {
                    ForEach(uniqueSites, id: \.self) { tag in
                        Toggle(tag, isOn: bindingIncluded($includedSites, tag))
                    }
                }
                DisclosureGroup("Time band") {
                    ForEach(TimeBand.allCases) { band in
                        Toggle(band.rawValue.capitalized, isOn: bindingIncludedTimeBand(band))
                    }
                }
                if uniqueDurationMinutes.isEmpty {
                    Text("Time commitment options appear here once this week has scheduled roles (each option is a real job length in minutes).")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    DisclosureGroup("Time commitment (job length)") {
                        ForEach(uniqueDurationMinutes, id: \.self) { mins in
                            Toggle(Self.durationMinutesFilterLabel(mins), isOn: bindingIncludedMinutes($includedDurationMinutes, mins))
                        }
                    }
                }
                if hasAnyFilterSet {
                    Button("Clear filters") {
                        includedSlotLabels = []
                        includedWeekDates = []
                        includedSites = []
                        includedTimeBands = []
                        includedDurationMinutes = []
                    }
                }
            }

            if let actionError {
                Section {
                    Text(actionError).foregroundStyle(.red).font(.caption)
                }
            }

            Section("Open roles (\(filteredRows.count))") {
                if filteredRows.isEmpty {
                    Text(rows.isEmpty ? "Nothing scheduled for this week, or filters hide every row." : "No rows match these filters.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(filteredRows, id: \.task.id) { item in
                        volunteerRow(item)
                    }
                }
            }
        }
        .navigationTitle("Week signup")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Reload") { Task { await reloadAll() } }
                    .disabled(busy)
            }
        }
        .task(id: retreatId) { await reloadAll() }
        .refreshable { await reloadAll() }
        .onChange(of: selfVolunteerId) { _, _ in
            calendarHttpsUrl = nil
            calendarWebcalUrl = nil
            calendarFeedError = nil
        }
        if let error { Text(error).foregroundStyle(.red).padding(.horizontal) }
    }

    private var hasAnyFilterSet: Bool {
        !includedSlotLabels.isEmpty || !includedWeekDates.isEmpty || !includedSites.isEmpty || !includedTimeBands.isEmpty
            || !includedDurationMinutes.isEmpty
    }

    private static func durationMinutesFilterLabel(_ minutes: Int) -> String {
        if minutes >= 60, minutes % 60 == 0 {
            let h = minutes / 60
            return "\(minutes) min (\(h) hr)"
        }
        return "\(minutes) min"
    }

    private func bindingIncluded(_ set: Binding<Set<String>>, _ value: String) -> Binding<Bool> {
        Binding(
            get: { set.wrappedValue.contains(value) },
            set: { on in
                if on { set.wrappedValue.insert(value) } else { set.wrappedValue.remove(value) }
            }
        )
    }

    private func bindingIncludedTimeBand(_ band: TimeBand) -> Binding<Bool> {
        Binding(
            get: { includedTimeBands.contains(band) },
            set: { on in
                if on { includedTimeBands.insert(band) } else { includedTimeBands.remove(band) }
            }
        )
    }

    private func bindingIncludedMinutes(_ set: Binding<Set<Int>>, _ value: Int) -> Binding<Bool> {
        Binding(
            get: { set.wrappedValue.contains(value) },
            set: { on in
                if on { set.wrappedValue.insert(value) } else { set.wrappedValue.remove(value) }
            }
        )
    }

    private func volunteerLoadActualAvgLabel(_ m: VolunteerDayLoadMetrics) -> String {
        guard let a = m.avgMinutesPerWorkerActual else { return "—" }
        let s = String(format: "%.1f", a)
        return m.usesSlotFallbackForAvg ? "~\(s)" : s
    }

    @ViewBuilder
    private func volunteerDayByDayMetricsCard(_ m: VolunteerDayLoadMetrics) -> some View {
        let demandPm = m.totalVolunteerMinutesDemand
        let filledPm = m.assignedPersonMinutes
        let demandCap = max(m.totalVolunteerMinutesDemand, 1)
        let personMinFillRatio = min(Double(m.assignedPersonMinutes) / Double(demandCap), 1)
        let filledPmCapped = min(filledPm, max(demandPm, filledPm))
        let unfilledPm = max(0, demandPm - filledPmCapped)
        let slotsFilledVis = min(m.filledSlotCount, m.volunteerSlotsDemand)
        let slotsForPeopleBar = max(m.volunteerSlotsDemand, 1)
        let distinctRaw = m.distinctVolunteersAssigned ?? 0
        let distinctCapped = min(max(distinctRaw, 0), m.volunteerSlotsDemand)

        VStack(alignment: .leading, spacing: 8) {
            Text(m.displayLabel)
                .font(.subheadline.weight(.semibold))

            Text("Person·min (bar = demand; teal = filled)")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Chart {
                if demandPm > 0 {
                    BarMark(
                        xStart: .value("Start", 0),
                        xEnd: .value("Filled end", filledPmCapped),
                        y: .value("Row", "pm")
                    )
                    .foregroundStyle(Color.teal)
                    BarMark(
                        xStart: .value("Filled end", filledPmCapped),
                        xEnd: .value("Demand end", demandPm),
                        y: .value("Row", "pm")
                    )
                    .foregroundStyle(Color.indigo.opacity(0.4))
                }
            }
            .chartYAxis(.hidden)
            .chartLegend(.hidden)
            .chartXAxis {
                AxisMarks(preset: .extended, position: .bottom) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let n = value.as(Int.self) {
                            Text("\(n)").font(.caption2)
                        }
                    }
                }
            }
            .chartXScale(domain: 0 ... max(demandPm, 1))
            .frame(height: 28)
            .padding(.vertical, 2)

            Text("\(demandPm) demand · \(filledPm) filled")
                .font(.caption2)
                .foregroundStyle(.secondary)

            HStack(alignment: .center, spacing: 10) {
                if demandPm > 0 {
                    Chart {
                        SectorMark(
                            angle: .value("Filled", Double(filledPmCapped)),
                            innerRadius: .ratio(0.58),
                            angularInset: 0.8
                        )
                        .foregroundStyle(Color.teal)
                        if unfilledPm > 0 {
                            SectorMark(
                                angle: .value("Unfilled", Double(unfilledPm)),
                                innerRadius: .ratio(0.58),
                                angularInset: 0.8
                            )
                            .foregroundStyle(Color.indigo.opacity(0.38))
                        }
                    }
                    .chartLegend(.hidden)
                    .frame(width: 48, height: 48)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Person-minute fill")
                    .accessibilityValue(String(format: "%.0f percent", personMinFillRatio * 100))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Fill (person·min)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(String(format: "%.0f%%", personMinFillRatio * 100))
                        .font(.caption.weight(.semibold))
                }
                Spacer(minLength: 0)
            }

            Text("Slots (bar = slots needed; orange = filled)")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Chart {
                if m.volunteerSlotsDemand > 0 {
                    BarMark(
                        xStart: .value("s0", 0),
                        xEnd: .value("s1", slotsFilledVis),
                        y: .value("Row", "slots")
                    )
                    .foregroundStyle(Color.orange.opacity(0.78))
                    BarMark(
                        xStart: .value("s1", slotsFilledVis),
                        xEnd: .value("s2", m.volunteerSlotsDemand),
                        y: .value("Row", "slots")
                    )
                    .foregroundStyle(Color(uiColor: .tertiarySystemFill))
                }
            }
            .chartYAxis(.hidden)
            .chartLegend(.hidden)
            .chartXAxis {
                AxisMarks(preset: .automatic, position: .bottom) { value in
                    AxisValueLabel {
                        if let n = value.as(Int.self) {
                            Text("\(n)").font(.caption2)
                        }
                    }
                }
            }
            .chartXScale(domain: 0 ... max(m.volunteerSlotsDemand, 1))
            .frame(height: 28)
            .padding(.vertical, 2)

            Text("Slots filled \(m.filledSlotCount) / \(m.volunteerSlotsDemand)")
                .font(.caption2)
                .foregroundStyle(.secondary)

            if m.volunteerSlotsDemand > 0 {
                Text("Distinct people vs slots (bar = slots needed; purple = distinct)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Chart {
                    BarMark(
                        xStart: .value("p0", 0),
                        xEnd: .value("p1", distinctCapped),
                        y: .value("Row", "people")
                    )
                    .foregroundStyle(Color.purple.opacity(0.78))
                    BarMark(
                        xStart: .value("p1", distinctCapped),
                        xEnd: .value("p2", m.volunteerSlotsDemand),
                        y: .value("Row", "people")
                    )
                    .foregroundStyle(Color(uiColor: .tertiarySystemFill))
                }
                .chartYAxis(.hidden)
                .chartLegend(.hidden)
                .chartXAxis {
                    AxisMarks(preset: .automatic, position: .bottom) { value in
                        AxisValueLabel {
                            if let n = value.as(Int.self) {
                                Text("\(n)").font(.caption2)
                            }
                        }
                    }
                }
                .chartXScale(domain: 0 ... slotsForPeopleBar)
                .frame(height: 28)
                .padding(.vertical, 2)

                Text(
                    (m.distinctVolunteersAssigned.map { "\($0) distinct" } ?? "— distinct")
                        + " · \(m.volunteerSlotsDemand) slots",
                )
                .font(.caption2)
                .foregroundStyle(.secondary)
            } else {
                Text("Distinct people: \(m.distinctVolunteersAssigned.map(String.init) ?? "—")")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Avg demand (min / slot)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(String(format: "%.1f", m.avgMinutesPerSlotDemand))
                        .font(.caption)
                }
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 4) {
                    Text("Slots needed")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("\(m.volunteerSlotsDemand)")
                        .font(.caption)
                }
            }

            HStack(alignment: .firstTextBaseline) {
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 4) {
                    Text("Avg actual (min / person)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(volunteerLoadActualAvgLabel(m))
                        .font(.caption)
                }
            }
        }
        .font(.caption)
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private var volunteerLoadMetricsTable: some View {
        let totals = dayLoadMetrics.reduce(into: (demand: 0, slots: 0, filled: 0, fslots: 0)) { a, m in
            a.demand += m.totalVolunteerMinutesDemand
            a.slots += m.volunteerSlotsDemand
            a.filled += m.assignedPersonMinutes
            a.fslots += m.filledSlotCount
        }
        let avgDemand = totals.slots > 0 ? Double(totals.demand) / Double(totals.slots) : 0
        let avgFilledPerSlot = totals.fslots > 0 ? Double(totals.filled) / Double(totals.fslots) : nil

        VStack(alignment: .leading, spacing: 10) {
            Text("By day")
                .font(.caption.weight(.semibold))
            ForEach(dayLoadMetrics) { m in
                volunteerDayByDayMetricsCard(m)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Week total")
                    .font(.subheadline.weight(.semibold))
                LabeledContent("Demand (person·min)") {
                    Text("\(totals.demand)")
                }
                LabeledContent("Slots needed") {
                    Text("\(totals.slots)")
                }
                LabeledContent("Avg demand (min per slot)") {
                    Text(String(format: "%.1f", avgDemand))
                }
                LabeledContent("Filled (person·min)") {
                    Text("\(totals.filled)")
                }
                LabeledContent("Avg filled (min per filled slot)") {
                    Text(avgFilledPerSlot.map { String(format: "%.1f", $0) } ?? "—")
                }
            }
            .font(.caption)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .tertiarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Text("Demand avg assumes no double duty. Actual avg uses distinct volunteers when the API lists them; a leading ~ means per filled slot.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func volunteerRow(_ item: ScheduleDayItem) -> some View {
        let need = item.task.volunteersNeeded ?? item.job.volunteersNeeded
        let filled = item.task.assignmentCount ?? 0
        let mine = item.assignments?.first { $0.volunteerId == selfVolunteerId }
        let canAct = selfIsLinked && !selfVolunteerId.isEmpty
        let acting = actingTaskIds.contains(item.task.id)

        VStack(alignment: .leading, spacing: 8) {
            Text(item.job.title)
                .font(.headline)
            Text("\(item.slot.label) · \(volunteerWeekDayLabel(iso: item.slot.slotDate, calendar: calendar))")
                .font(.subheadline)
            HStack(spacing: 6) {
                Text(item.slot.timeBand.rawValue.capitalized)
                    .font(.caption)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color(uiColor: .tertiarySystemFill))
                    .clipShape(Capsule())
                Text("\(item.job.estimatedMinutes) min")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(filled)/\(need) filled")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            let site = effectiveActivityContext(for: item)
            if !site.isEmpty {
                Text("Site / context: \(site)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if let notes = item.task.notes, !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(notes)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack {
                if let a = mine {
                    Button(role: .destructive) {
                        Task { await leave(task: item.task, assignmentId: a.id) }
                    } label: {
                        if acting { ProgressView() } else { Text("Leave this slot") }
                    }
                    .disabled(acting || !canAct)
                } else if filled < need {
                    Button {
                        Task { await signUp(task: item.task) }
                    } label: {
                        if acting { ProgressView() } else { Text("Sign up") }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(acting || !canAct)
                } else {
                    Text("Full")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func shiftWeek(by days: Int) {
        guard let d = calendar.date(byAdding: .day, value: days, to: weekMonday) else { return }
        weekMonday = volunteerWeekMonday(containing: d, calendar: calendar)
        Task { await loadWeekRows() }
    }

    private func jumpToWeekContainingToday() {
        weekMonday = volunteerWeekMonday(containing: Date(), calendar: calendar)
        Task { await loadWeekRows() }
    }

    private func jumpToRetreatStartWeek() {
        guard let r = retreat else { return }
        let cal = retreatCalendar(timezoneId: JewelHeartConfig.jewelheartDefaultTimeZoneId)
        weekMonday = volunteerSignupInitialWeekMonday(retreat: r, calendar: cal)
        Task { await loadWeekRows() }
    }

    private func reloadAll() async {
        await MainActor.run { busy = true; error = nil; actionError = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            async let r = api.getRetreat(retreatId: retreatId)
            async let v = api.listRetreatVolunteers(retreatId: retreatId)
            let (ret, vols) = try await (r, v)
            let cal = retreatCalendar(timezoneId: JewelHeartConfig.jewelheartDefaultTimeZoneId)
            let initialMonday = volunteerSignupInitialWeekMonday(retreat: ret, calendar: cal)
            await MainActor.run {
                retreat = ret
                linkedVolunteers = vols.items
                weekMonday = initialMonday
            }
            try await fetchWeekScheduleMerged()
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    /// Prefer API `webcalSubscribeUrl`; if it is https or missing, derive `webcal://` from the HTTPS feed URL.
    private func calendarSubscribeWebcalURL() -> URL? {
        let w = calendarWebcalUrl?.trimmingCharacters(in: .whitespacesAndNewlines)
        let h = calendarHttpsUrl?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let w, !w.isEmpty {
            if w.lowercased().hasPrefix("webcal://") { return URL(string: w) }
            if w.lowercased().hasPrefix("https://"), var c = URLComponents(string: w) {
                c.scheme = "webcal"
                return c.url
            }
            if w.lowercased().hasPrefix("http://"), var c = URLComponents(string: w) {
                c.scheme = "webcal"
                return c.url
            }
        }
        if let h, (h.lowercased().hasPrefix("https://") || h.lowercased().hasPrefix("http://")), var c = URLComponents(string: h) {
            c.scheme = "webcal"
            return c.url
        }
        return nil
    }

    private func mintCalendarFeed(regenerate: Bool) async {
        guard selfIsLinked, !selfVolunteerId.isEmpty else {
            await MainActor.run { calendarFeedError = "Choose a linked volunteer profile first." }
            return
        }
        await MainActor.run { calendarFeedBusy = true; calendarFeedError = nil }
        defer { Task { @MainActor in calendarFeedBusy = false } }
        do {
            let res = try await api.mintVolunteerCalendarFeed(volunteerId: selfVolunteerId, regenerate: regenerate)
            await MainActor.run {
                calendarHttpsUrl = res.subscribeHttpsUrl
                calendarWebcalUrl = res.webcalSubscribeUrl
            }
        } catch {
            await MainActor.run { calendarFeedError = error.localizedDescription }
        }
    }

    private func fetchWeekScheduleMerged() async throws {
        let cal = retreatCalendar(timezoneId: JewelHeartConfig.jewelheartDefaultTimeZoneId)
        let anchor = await MainActor.run { weekMonday }
        let monday = volunteerWeekMonday(containing: anchor, calendar: cal)
        let days = volunteerWeekDayStrings(monday: monday, calendar: cal)
        var merged: [ScheduleDayItem] = []
        merged.reserveCapacity(days.count * 8)
        try await withThrowingTaskGroup(of: ScheduleDayResponse.self) { group in
            for d in days {
                group.addTask {
                    try await api.getScheduleByDay(retreatId: retreatId, date: d)
                }
            }
            for try await res in group {
                merged.append(contentsOf: res.items)
            }
        }
        var seen = Set<String>()
        let deduped = merged.filter { seen.insert($0.task.id).inserted }
        let allowedMinutes = Set(deduped.map(\.job.estimatedMinutes))
        await MainActor.run {
            weekMonday = monday
            rows = deduped
            includedDurationMinutes = includedDurationMinutes.intersection(allowedMinutes)
            error = nil
        }
    }

    private func loadWeekRows() async {
        do {
            try await fetchWeekScheduleMerged()
        } catch {
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func signUp(task: JHTask) async {
        await MainActor.run { actionError = nil }
        guard canAct else {
            await MainActor.run { actionError = "Choose a linked volunteer profile first." }
            return
        }
        await MainActor.run { () -> Void in
            actingTaskIds.insert(task.id)
        }
        defer { Task { @MainActor in actingTaskIds.remove(task.id) } }
        do {
            _ = try await api.createAssignment(
                retreatId: retreatId,
                taskId: task.id,
                body: AssignmentCreate(volunteerId: selfVolunteerId)
            )
            try await fetchWeekScheduleMerged()
        } catch {
            await MainActor.run { actionError = error.localizedDescription }
        }
    }

    private func leave(task: JHTask, assignmentId: String) async {
        await MainActor.run { actionError = nil }
        await MainActor.run { () -> Void in
            actingTaskIds.insert(task.id)
        }
        defer { Task { @MainActor in actingTaskIds.remove(task.id) } }
        do {
            try await api.deleteAssignment(retreatId: retreatId, assignmentId: assignmentId)
            try await fetchWeekScheduleMerged()
        } catch {
            await MainActor.run { actionError = error.localizedDescription }
        }
    }

    private var canAct: Bool { selfIsLinked && !selfVolunteerId.isEmpty }
}

struct ScheduleDayView: View {
    let retreatId: String
    private let api = JewelHeartAPI()
    @State private var day = Date()
    @State private var response: ScheduleDayResponse?
    @State private var error: String?
    @State private var suggestedDates: [String] = []

    var body: some View {
        List {
            Section {
                if !suggestedDates.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(suggestedDates, id: \.self) { d in
                                Button(d) {
                                    if let dt = AdminDayFormat.api.date(from: d) {
                                        day = dt
                                    }
                                    Task { await load() }
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }
                    Text("From slots on this retreat").font(.caption).foregroundStyle(.secondary)
                }
                DatePicker("Day", selection: $day, displayedComponents: .date)
                Button("Load schedule") { Task { await load() } }
            }
            if let r = response {
                let volMin = r.items.reduce(0) { $0 + $1.job.volunteersNeeded * $1.job.estimatedMinutes }
                Section("Tasks (\(r.items.count)) · ~\(volMin) volunteer-min") {
                    ForEach(Array(r.items.enumerated()), id: \.offset) { _, item in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.job.title).font(.headline)
                            Text("\(item.slot.label) · \(item.slot.slotDate) · \(item.job.volunteersNeeded)v × \(item.job.estimatedMinutes)m")
                                .font(.subheadline)
                            let need = item.task.volunteersNeeded ?? item.job.volunteersNeeded
                            let ac = item.task.assignmentCount ?? 0
                            Text("Assigned \(ac) / \(need)").font(.caption)
                            if let notes = item.task.notes, !notes.isEmpty {
                                Text(notes).font(.caption).foregroundStyle(.secondary)
                            }
                            if let assigns = item.assignments, !assigns.isEmpty {
                                let names = assigns.compactMap { a -> String? in
                                    guard let v = a.volunteer else { return nil }
                                    let n = v.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
                                    return n.isEmpty ? nil : n
                                }
                                if !names.isEmpty {
                                    Text(names.joined(separator: ", "))
                                        .font(.caption2)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle("Schedule")
        .task(id: retreatId) { await loadSuggestedDates() }
        if let error { Text(error).foregroundStyle(.red).padding() }
    }

    private func loadSuggestedDates() async {
        do {
            let sl = try await api.listSlots(retreatId: retreatId)
            let u = Array(Set(sl.items.map(\.slotDate))).sorted()
            await MainActor.run { suggestedDates = u }
        } catch {
            await MainActor.run { suggestedDates = [] }
        }
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
