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

@MainActor
final class RetreatV7Store: ObservableObject {
    static let shared = RetreatV7Store()

    let data: RetreatV7Data
    private let jobsById: [String: RetreatV7Job]
    private let shiftsById: [String: RetreatV7Shift]

    @Published private(set) var myShiftIds: Set<String> = []

    private init() {
        let url = Bundle.main.url(forResource: "retreat_v7", withExtension: "json")!
        let decoded = try! JSONDecoder().decode(RetreatV7Data.self, from: Data(contentsOf: url))
        data = decoded
        jobsById = Dictionary(uniqueKeysWithValues: decoded.jobs.map { ($0.id, $0) })
        shiftsById = Dictionary(uniqueKeysWithValues: decoded.shifts.map { ($0.id, $0) })
    }

    func today() -> Date {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withFullDate]
        if JewelHeartConfig.volunteerV2UseTestToday,
           let d = fmt.date(from: data.testToday + "T12:00:00Z") {
            return d
        }
        return Date()
    }

    func retreatStart() -> Date {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withFullDate]
        return fmt.date(from: data.startDate + "T12:00:00Z")!
    }

    func currentDayNumber() -> Int? {
        let cal = Calendar(identifier: .gregorian)
        let start = cal.startOfDay(for: retreatStart())
        let now = cal.startOfDay(for: today())
        let days = cal.dateComponents([.day], from: start, to: now).day ?? 0
        let n = days + 1
        return (1...data.scheduledDays).contains(n) ? n : nil
    }

    func dayLabel(dayNumber: Int, weekday: String) -> String { "\(dayNumber) (\(weekday))" }

    func searchableDays() -> [Int] {
        let from = currentDayNumber() ?? 1
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
                Text(name).font(.title2.bold())
                if let dayNum {
                    Text("Retreat day \(store.dayLabel(dayNumber: dayNum, weekday: weekday))")
                } else {
                    Text("Before retreat")
                }
                Text("\(store.myShiftIds.count) task(s) signed up")
                if let next = store.nextAssignment() {
                    Text("Next: \(next.jobTitle) · day \(next.dayNumber) · \(next.slot)")
                } else {
                    Text("No upcoming assignments")
                }
            }
            Section {
                NavigationLink { VolunteerV2SearchView() } label: {
                    Text("Sign up for one or more tasks")
                }
                .listRowBackground(signupBlue)
                NavigationLink { VolunteerV2MySignupsView() } label: {
                    Text("See existing signups")
                }
                .listRowBackground(signupsRed)
                NavigationLink { VolunteerV2CheckInView() } label: {
                    Text("Check in to a task")
                }
                .listRowBackground(checkinGreen)
            }
        }
        .navigationTitle(store.data.retreatName)
    }
}

struct VolunteerV2SearchView: View {
    @EnvironmentObject private var store: RetreatV7Store
    @State private var selectedDays: Set<Int> = []
    @State private var selectedJobId: String?
    @State private var goResults = false

    var body: some View {
        Form {
            Section("Days (from today)") {
                ForEach(store.searchableDays(), id: \.self) { day in
                    let sample = store.data.shifts.first { $0.dayNumber == day }!
                    Toggle(
                        "Day \(store.dayLabel(dayNumber: day, weekday: sample.weekday))",
                        isOn: Binding(
                            get: { selectedDays.contains(day) },
                            set: { on in
                                if on { selectedDays.insert(day) } else { selectedDays.remove(day) }
                            }
                        )
                    )
                }
            }
            Section("Job (optional)") {
                Toggle(
                    "Any job",
                    isOn: Binding(get: { selectedJobId == nil }, set: { if $0 { selectedJobId = nil } })
                )
                ForEach(store.data.jobs.sorted(by: { $0.title < $1.title })) { job in
                    Toggle(
                        job.title,
                        isOn: Binding(
                            get: { selectedJobId == job.id },
                            set: { selectedJobId = $0 ? job.id : nil }
                        )
                    )
                }
            }
            Button("Search") {
                VolunteerV2SearchState.selectedDays = selectedDays
                VolunteerV2SearchState.selectedJobId = selectedJobId
                goResults = true
            }
            .disabled(selectedDays.isEmpty)
        }
        .scrollContentBackground(.hidden)
        .background(signupBlue)
        .navigationTitle("Search for available tasks")
        .navigationDestination(isPresented: $goResults) {
            VolunteerV2AvailableView()
        }
        .onAppear { selectedDays = Set(store.searchableDays()) }
    }
}

struct VolunteerV2AvailableView: View {
    @EnvironmentObject private var store: RetreatV7Store

    private var results: [RetreatV7Shift] {
        store.searchShifts(
            dayNumbers: VolunteerV2SearchState.selectedDays,
            jobId: VolunteerV2SearchState.selectedJobId
        )
    }

    var body: some View {
        Group {
            if results.isEmpty {
                ContentUnavailableView("No matches", systemImage: "magnifyingglass")
            } else {
                List(results) { shift in
                    NavigationLink {
                        VolunteerV2ShiftView(shiftId: shift.id)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(shift.jobTitle).fontWeight(.medium)
                            Text("Day \(shift.dayNumber) (\(shift.weekday)) · \(shift.slot)")
                                .font(.subheadline)
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(signupBlue)
        .navigationTitle("Available tasks")
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
            ContentUnavailableView("Task not found", systemImage: "exclamationmark.triangle")
        }
    }

    @ViewBuilder
    private func shiftContent(_ shift: RetreatV7Shift) -> some View {
        let job = store.job(for: shift)
        let assigned = store.isAssignedToMe(shiftId)
        let steps = job?.instructions.filter { !$0.isEmpty } ?? []

        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(shift.site).fontWeight(.semibold)
                Text(shift.activity)
                Text("Day \(store.dayLabel(dayNumber: shift.dayNumber, weekday: shift.weekday))")
                Text("Slot: \(shift.slot)")
                Text("About \(shift.estimatedMinutes) min").foregroundStyle(.secondary)
                Text("Instructions").fontWeight(.semibold)
                if steps.isEmpty {
                    Text("(No instructions listed)").foregroundStyle(.secondary)
                } else {
                    ForEach(steps, id: \.self) { Text("• \($0)") }
                }
                if assigned {
                    Button("Remove my assignment", role: .destructive) {
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
                            alertMessage =
                                "NOT assigned — looks like someone else just grabbed it (or technical problem?)"
                        }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(signupBlue)
        .navigationTitle(shift.jobTitle)
        .alert(
            "Notice",
            isPresented: Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })
        ) {
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
            Text("This task is today or tomorrow. Please recruit someone else if you can.")
        }
    }
}

struct VolunteerV2MySignupsView: View {
    @EnvironmentObject private var store: RetreatV7Store

    var body: some View {
        Group {
            if store.myShiftsFromToday().isEmpty {
                ContentUnavailableView("No signups", systemImage: "calendar")
            } else {
                List(store.myShiftsFromToday()) { shift in
                    NavigationLink {
                        VolunteerV2ShiftView(shiftId: shift.id)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(shift.jobTitle).fontWeight(.medium)
                            Text("Day \(shift.dayNumber) (\(shift.weekday)) · \(shift.slot)")
                                .font(.subheadline)
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(signupsRed)
        .navigationTitle("My signups")
    }
}

struct VolunteerV2CheckInView: View {
    @EnvironmentObject private var store: RetreatV7Store

    var body: some View {
        List {
            if store.todaysMyShifts().isEmpty {
                Text("No assignments for today.")
            } else {
                Section("Today's assignments") {
                    ForEach(store.todaysMyShifts()) { shift in
                        NavigationLink {
                            VolunteerV2ShiftView(shiftId: shift.id)
                        } label: {
                            Text("\(shift.jobTitle) · \(shift.slot)")
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(checkinGreen)
        .navigationTitle("Check in")
    }
}
