import FirebaseAuth
import SwiftUI

struct RetreatV7Data: Codable {
    let retreatName: String
    let startDate: String
    let endDate: String
    let scheduledDays: Int
    let testToday: String
    let shifts: [RetreatV7Shift]
    let jobs: [RetreatV7Job]
}

struct RetreatV7Shift: Codable, Identifiable, Hashable {
    let id: String
    let dayNumber: Int
    let weekday: String
    let slot: String
    let site: String
    let activity: String
    let jobTitle: String
    let jobId: String
    let volunteersNeeded: Int
    let estimatedMinutes: Int
}

struct RetreatV7Job: Codable, Identifiable {
    let id: String
    let site: String
    let activity: String
    let title: String
    let instructions: [String]
}

enum VolunteerV2Format {
    static func shiftLine(_ shift: RetreatV7Shift) -> String {
        let job = "\(shift.site), \(shift.activity)"
        let slot = compactSlotLabel(shift.slot)
        return slot.isEmpty ? job : "\(job) · \(slot)"
    }

    static func compactSlotLabel(_ slot: String) -> String {
        switch slot {
        case "Any time": return "any time"
        case "Start day": return "start of day"
        case "End day": return "end of day"
        default: return slot
        }
    }

    static func slotTimingText(_ slot: String) -> String {
        switch slot {
        case "Any time": return "Can be done at any time throughout the day"
        case "Start day": return "Do this at start of day"
        case "End day": return "Do this at end of day"
        default: return "Do this at \(slot)"
        }
    }

    static func dayHeader(_ dayNumber: Int) -> String { "Day \(dayNumber)" }

    static func groupByDay(_ shifts: [RetreatV7Shift]) -> [(Int, [RetreatV7Shift])] {
        Dictionary(grouping: shifts, by: \.dayNumber)
            .sorted { $0.key < $1.key }
            .map { ($0.key, $0.value) }
    }
}

@MainActor
final class RetreatV7Store: ObservableObject {
    static let shared = RetreatV7Store()

    let data: RetreatV7Data
    private let jobsById: [String: RetreatV7Job]
    private let shiftsById: [String: RetreatV7Shift]

    @Published private(set) var myShiftIds: Set<String> = []

    private init(data: RetreatV7Data? = nil) {
        let decoded = data ?? RetreatV7Store.loadBundledData()
        self.data = decoded
        jobsById = Dictionary(uniqueKeysWithValues: decoded.jobs.map { ($0.id, $0) })
        shiftsById = Dictionary(uniqueKeysWithValues: decoded.shifts.map { ($0.id, $0) })
    }

    private static func loadBundledData() -> RetreatV7Data {
        guard let url = Bundle.main.url(forResource: "retreat_v7", withExtension: "json") else {
            assertionFailure("Missing retreat_v7.json bundle resource")
            return makeEmptyData()
        }
        do {
            return try JSONDecoder().decode(RetreatV7Data.self, from: Data(contentsOf: url))
        } catch {
            assertionFailure("Failed to decode retreat_v7.json: \(error)")
            return makeEmptyData()
        }
    }

    private static func makeEmptyData() -> RetreatV7Data {
        RetreatV7Data(
            retreatName: "Volunteer shifts",
            startDate: "",
            endDate: "",
            scheduledDays: 0,
            testToday: "",
            shifts: [],
            jobs: []
        )
    }

    private static func date(from isoDay: String) -> Date? {
        guard !isoDay.isEmpty else { return nil }
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime]
        let text = isoDay.contains("T") ? isoDay : "\(isoDay)T12:00:00Z"
        return fmt.date(from: text)
    }

    func today() -> Date {
        if JewelHeartConfig.volunteerV2UseTestToday,
           let d = Self.date(from: data.testToday) {
            return d
        }
        return Date()
    }

    func retreatStart() -> Date? { Self.date(from: data.startDate) }

    func currentDayNumber() -> Int? {
        guard data.scheduledDays >= 1 else { return nil }
        guard let retreatStart = retreatStart() else { return nil }
        let cal = Calendar(identifier: .gregorian)
        let start = cal.startOfDay(for: retreatStart)
        let now = cal.startOfDay(for: today())
        let days = cal.dateComponents([.day], from: start, to: now).day ?? 0
        let n = days + 1
        return (1...data.scheduledDays).contains(n) ? n : nil
    }

    func dayLabel(dayNumber: Int, weekday: String) -> String { "\(dayNumber) (\(weekday))" }

    func searchableDays() -> [Int] {
        let from = currentDayNumber() ?? 1
        guard from <= data.scheduledDays else { return [] }
        return Array(from...data.scheduledDays)
    }

    func job(for shift: RetreatV7Shift) -> RetreatV7Job? { jobsById[shift.jobId] }

    func shift(id: String) -> RetreatV7Shift? { shiftsById[id] }

    func isAssignedToMe(_ shiftId: String) -> Bool { myShiftIds.contains(shiftId) }

    func searchShifts(dayNumbers: Set<Int>, jobId: String?) -> [RetreatV7Shift] {
        let fromDay = currentDayNumber() ?? 1
        return data.shifts
            .filter { dayNumbers.contains($0.dayNumber) && $0.dayNumber >= fromDay }
            .filter { jobId == nil || $0.jobId == jobId }
            .filter { !isAssignedToMe($0.id) }
            .sorted { a, b in
                if a.dayNumber != b.dayNumber { return a.dayNumber < b.dayNumber }
                if slotOrder(a.slot) != slotOrder(b.slot) { return slotOrder(a.slot) < slotOrder(b.slot) }
                return a.jobTitle < b.jobTitle
            }
    }

    func myShiftsFromToday() -> [RetreatV7Shift] {
        let fromDay = currentDayNumber() ?? 1
        return data.shifts
            .filter { myShiftIds.contains($0.id) && $0.dayNumber >= fromDay }
            .sorted { a, b in
                if a.dayNumber != b.dayNumber { return a.dayNumber < b.dayNumber }
                return slotOrder(a.slot) < slotOrder(b.slot)
            }
    }

    func todaysMyShifts() -> [RetreatV7Shift] {
        guard let day = currentDayNumber() else { return [] }
        return data.shifts.filter { myShiftIds.contains($0.id) && $0.dayNumber == day }
    }

    func nextAssignment() -> RetreatV7Shift? { myShiftsFromToday().first }

    @discardableResult
    func assignToMe(shiftId: String) -> Bool {
        guard shiftsById[shiftId] != nil, !isAssignedToMe(shiftId) else {
            return isAssignedToMe(shiftId)
        }
        myShiftIds.insert(shiftId)
        return true
    }

    func unassign(shiftId: String) { myShiftIds.remove(shiftId) }

    private func slotOrder(_ slot: String) -> Int {
        switch slot {
        case "Start day": return 0
        case "Morning break": return 1
        case "Lunch break": return 2
        case "Afternoon break": return 3
        case "Dinner break": return 4
        case "End day": return 5
        case "Any time": return 6
        default: return 7
        }
    }
}

enum VolunteerV2SearchState {
    static var selectedDays: Set<Int> = []
    static var selectedJobId: String?
}

private let signupBlue = Color(red: 0.84, green: 0.92, blue: 1.0)
private let signupsRed = Color(red: 1.0, green: 0.88, blue: 0.88)
private let checkinGreen = Color(red: 0.87, green: 0.96, blue: 0.89)

struct VolunteerV2RootView: View {
    @StateObject private var store = RetreatV7Store.shared

    var body: some View {
        NavigationStack {
            VolunteerV2HomeView()
                .environmentObject(store)
        }
    }
}

struct VolunteerV2HomeView: View {
    @EnvironmentObject private var store: RetreatV7Store

    private var name: String { Auth.auth().currentUser?.displayName ?? "Volunteer" }

    var body: some View {
        let dayNum = store.currentDayNumber()
        let weekday = store.data.shifts.first(where: { $0.dayNumber == dayNum })?.weekday ?? ""
        List {
            Section {
                Text(name).font(.headline)
                if let dayNum {
                    Text("Retreat day \(store.dayLabel(dayNumber: dayNum, weekday: weekday))")
                        .font(.subheadline)
                } else {
                    Text("Before retreat").font(.subheadline)
                }
                Text("\(store.myShiftIds.count) assignment(s)").font(.subheadline)
                if let next = store.nextAssignment() {
                    Text("Next: \(VolunteerV2Format.shiftLine(next))").font(.subheadline)
                } else {
                    Text("No upcoming assignments").font(.subheadline)
                }
            }
            Section {
                NavigationLink { VolunteerV2SearchView() } label: {
                    Text("Sign up for shifts")
                }
                .listRowBackground(signupBlue)
                NavigationLink { VolunteerV2MyAssignmentsView() } label: {
                    Text("My assignments")
                }
                .listRowBackground(signupsRed)
                NavigationLink { VolunteerV2CheckInView() } label: {
                    Text("Check in")
                }
                .listRowBackground(checkinGreen)
            }
        }
        .listStyle(.plain)
        .navigationTitle(store.data.retreatName)
    }
}

struct VolunteerV2SearchView: View {
    @EnvironmentObject private var store: RetreatV7Store
    @State private var selectedDays: Set<Int> = []
    @State private var selectedJobId: String?
    @State private var goResults = false

    var body: some View {
        let searchableDays = store.searchableDays()
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Days from today").font(.subheadline)
                if searchableDays.isEmpty {
                    Text("No upcoming retreat days.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    FlowLayout(spacing: 6) {
                        ForEach(searchableDays, id: \.self) { day in
                            let weekday = store.data.shifts.first { $0.dayNumber == day }?.weekday ?? ""
                            let label = weekday.isEmpty ? "\(day)" : "\(day)\(weekday.prefix(1))"
                            Button(label) {
                                if selectedDays.contains(day) { selectedDays.remove(day) }
                                else { selectedDays.insert(day) }
                            }
                            .buttonStyle(.bordered)
                            .tint(selectedDays.contains(day) ? .accentColor : .secondary)
                        }
                    }
                }
                Text("Job (optional)").font(.subheadline).padding(.top, 4)
                Toggle("Any job", isOn: Binding(get: { selectedJobId == nil }, set: { if $0 { selectedJobId = nil } }))
                ForEach(store.data.jobs.sorted(by: { $0.title < $1.title })) { job in
                    Toggle(job.title, isOn: Binding(
                        get: { selectedJobId == job.id },
                        set: { selectedJobId = $0 ? job.id : nil }
                    ))
                }
                Button("Search") {
                    VolunteerV2SearchState.selectedDays = selectedDays
                    VolunteerV2SearchState.selectedJobId = selectedJobId
                    goResults = true
                }
                .buttonStyle(.borderedProminent)
                .disabled(selectedDays.isEmpty)
            }
            .padding(12)
        }
        .background(signupBlue)
        .navigationTitle("Search shifts")
        .navigationDestination(isPresented: $goResults) {
            VolunteerV2AvailableView()
        }
        .onAppear { selectedDays = Set(searchableDays) }
    }
}

/// Simple flow layout for day toggle chips.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        layout(proposal: proposal, subviews: subviews).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (i, pos) in result.positions.enumerated() {
            subviews[i].place(at: CGPoint(x: bounds.minX + pos.x, y: bounds.minY + pos.y), proposal: .unspecified)
        }
    }
    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowH: CGFloat = 0
        var positions: [CGPoint] = []
        for sub in subviews {
            let s = sub.sizeThatFits(.unspecified)
            if x + s.width > maxW, x > 0 {
                x = 0
                y += rowH + spacing
                rowH = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowH = max(rowH, s.height)
            x += s.width + spacing
        }
        return (CGSize(width: maxW, height: y + rowH), positions)
    }
}

struct VolunteerV2AvailableView: View {
    @EnvironmentObject private var store: RetreatV7Store

    private var grouped: [(Int, [RetreatV7Shift])] {
        let dayNumbers = VolunteerV2SearchState.selectedDays.isEmpty
            ? Set(store.searchableDays())
            : VolunteerV2SearchState.selectedDays
        return VolunteerV2Format.groupByDay(store.searchShifts(
            dayNumbers: dayNumbers,
            jobId: VolunteerV2SearchState.selectedJobId
        ))
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if grouped.isEmpty {
                    Text("No open shifts match your search.").padding(12)
                } else {
                    ForEach(grouped, id: \.0) { day, shifts in
                        Text(VolunteerV2Format.dayHeader(day))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .padding(.top, 10)
                            .padding(.bottom, 2)
                        ForEach(shifts) { shift in
                            NavigationLink {
                                VolunteerV2ShiftView(shiftId: shift.id)
                            } label: {
                                Text(VolunteerV2Format.shiftLine(shift))
                                    .font(.subheadline)
                                    .padding(.vertical, 3)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 12)
        }
        .background(signupBlue)
        .navigationTitle("Available shifts")
    }
}

struct VolunteerV2ShiftView: View {
    @EnvironmentObject private var store: RetreatV7Store
    let shiftId: String
    @State private var alertMessage: String?
    @State private var showDropWarning = false

    var body: some View {
        if let shift = store.shift(id: shiftId) {
            shiftContent(shift)
        } else {
            ContentUnavailableView("Shift not found", systemImage: "exclamationmark.triangle")
        }
    }

    @ViewBuilder
    private func shiftContent(_ shift: RetreatV7Shift) -> some View {
        let job = store.job(for: shift)
        let assigned = store.isAssignedToMe(shiftId)
        let steps = job?.instructions.filter { !$0.isEmpty } ?? []

        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(VolunteerV2Format.dayHeader(shift.dayNumber)) · ~\(shift.estimatedMinutes) min")
                    .font(.subheadline)
                Text(VolunteerV2Format.shiftLine(shift)).font(.subheadline)
                Text(VolunteerV2Format.slotTimingText(shift.slot)).font(.subheadline)
                if steps.isEmpty {
                    Text("(No instructions listed)").font(.caption).foregroundStyle(.secondary)
                } else {
                    ForEach(steps, id: \.self) { Text("• \($0)").font(.subheadline) }
                }
                if assigned {
                    Button("Remove assignment", role: .destructive) {
                        if let day = store.currentDayNumber(), shift.dayNumber <= day + 1 {
                            showDropWarning = true
                        } else {
                            store.unassign(shiftId: shiftId)
                            alertMessage = "Assignment removed"
                        }
                    }
                    .buttonStyle(.bordered)
                } else {
                    Button("Assign to me") {
                        if store.assignToMe(shiftId: shiftId) {
                            alertMessage = "Assigned"
                        } else {
                            alertMessage = "NOT assigned — someone else may have taken it"
                        }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(signupBlue)
        .navigationTitle("Shift")
        .alert("Notice", isPresented: Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })) {
            Button("OK") { alertMessage = nil }
        } message: {
            Text(alertMessage ?? "")
        }
        .alert("Short notice", isPresented: $showDropWarning) {
            Button("Remove anyway", role: .destructive) {
                store.unassign(shiftId: shiftId)
                alertMessage = "Assignment removed"
            }
            Button("Keep", role: .cancel) {}
        } message: {
            Text("This assignment is today or tomorrow. Please recruit someone else if you can.")
        }
    }
}

struct VolunteerV2MyAssignmentsView: View {
    @EnvironmentObject private var store: RetreatV7Store
    @State private var markedForDelete: Set<String> = []

    private var grouped: [(Int, [RetreatV7Shift])] {
        VolunteerV2Format.groupByDay(store.myShiftsFromToday())
    }

    var body: some View {
        VStack(spacing: 0) {
            if store.myShiftsFromToday().isEmpty {
                ContentUnavailableView("No assignments", systemImage: "calendar")
            } else {
                Text("Check to mark for removal, then Delete marked.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(grouped, id: \.0) { day, shifts in
                            Text(VolunteerV2Format.dayHeader(day))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .padding(.top, 10)
                                .padding(.bottom, 2)
                            ForEach(shifts) { shift in
                                let marked = markedForDelete.contains(shift.id)
                                Button {
                                    if marked { markedForDelete.remove(shift.id) }
                                    else { markedForDelete.insert(shift.id) }
                                } label: {
                                    HStack(spacing: 8) {
                                        Image(systemName: marked ? "checkmark.square" : "square")
                                        Text(VolunteerV2Format.shiftLine(shift))
                                            .font(.subheadline)
                                            .strikethrough(marked)
                                            .opacity(marked ? 0.55 : 1)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, 3)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                }
                if !markedForDelete.isEmpty {
                    HStack(spacing: 8) {
                        Button("Don't delete") { markedForDelete.removeAll() }
                            .buttonStyle(.bordered)
                        Button("Delete marked") {
                            markedForDelete.forEach { store.unassign(shiftId: $0) }
                            markedForDelete.removeAll()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(12)
                }
            }
        }
        .background(signupsRed)
        .navigationTitle("My assignments")
    }
}

struct VolunteerV2CheckInView: View {
    @EnvironmentObject private var store: RetreatV7Store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                if store.todaysMyShifts().isEmpty {
                    Text("No assignments for today.")
                } else {
                    ForEach(store.todaysMyShifts()) { shift in
                        NavigationLink {
                            VolunteerV2ShiftView(shiftId: shift.id)
                        } label: {
                            Text(VolunteerV2Format.shiftLine(shift))
                                .font(.subheadline)
                                .padding(.vertical, 3)
                        }
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(checkinGreen)
        .navigationTitle("Check in")
    }
}
