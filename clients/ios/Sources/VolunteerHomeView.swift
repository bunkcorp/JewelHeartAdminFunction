import FirebaseAuth
import SwiftUI

// Reference implementation for volunteer home layout/data logic.
// Production Home tab loads `jewelheart.home` via SDUI (see RootView + jewelheart-service-sdui.fragment.js).

// MARK: - Brand colors (mockups.docx)

private enum VolunteerHomeColors {
    static let gold = Color(hex: "#FFCA10") ?? .yellow
    static let summaryBlue = Color(hex: "#7A95CA") ?? .blue
    static let actionMaroon = Color(hex: "#92160E") ?? .red
}

// MARK: - View

struct VolunteerHomeView: View {
    var reloadNonce: Int = 0

    @AppStorage("jewelheart.selfVolunteerId") private var selfVolunteerId: String = ""
    @StateObject private var model = VolunteerHomeModel()

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VolunteerHomeBar(text: model.retreatDayLine, background: VolunteerHomeColors.gold, foreground: .black)
                VolunteerHomeBar(text: "Volunteer Home", background: VolunteerHomeColors.gold, foreground: .black)

                VolunteerHomeBar(text: model.summaryLine, background: VolunteerHomeColors.summaryBlue, foreground: .white)
                ForEach(model.todayJobLines, id: \.self) { line in
                    VolunteerHomeBar(text: line, background: VolunteerHomeColors.summaryBlue, foreground: .white)
                }

                if let error = model.error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(12)
                } else if model.usingDemoData {
                    Text("Demo schedule (set Volunteer profile under Volunteer tab for live data).")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 12)
                        .padding(.top, 8)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .task(id: reloadNonce) { await model.load(selfVolunteerId: selfVolunteerId) }
    }
}

private struct VolunteerHomeBar: View {
    let text: String
    let background: Color
    let foreground: Color

    var body: some View {
        Text(text)
            .font(.headline.weight(.bold))
            .foregroundStyle(foreground)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .padding(.horizontal, 8)
            .background(background)
    }
}

// MARK: - Model

@MainActor
final class VolunteerHomeModel: ObservableObject {
    @Published var retreatDayLine = ""
    @Published var summaryLine = ""
    @Published var todayJobLines: [String] = []
    @Published var error: String?
    @Published private(set) var usingDemoData = false

    private let api = JewelHeartAPI()

    func load(selfVolunteerId: String) async {
        error = nil
        usingDemoData = false
        let calendar = retreatCalendar(timezoneId: JewelHeartConfig.jewelheartDefaultTimeZoneId)
        let today = volunteerHomeEffectiveToday(calendar: calendar)
        let todayIso = volunteerApiDayString(from: today, calendar: calendar)

        do {
            let retreats = try await api.listRetreats(cursor: nil, limit: 50).items
            guard let retreat = volunteerHomePickRetreat(retreats, today: today, calendar: calendar) else {
                applyDemo(calendar: calendar, today: today)
                error = "No retreat found."
                return
            }

            let dayNum = volunteerHomeDayNumber(retreat: retreat, today: today, calendar: calendar)
            let weekday = volunteerHomeWeekdayShort(today: today, calendar: calendar)
            retreatDayLine = "\(volunteerHomeRetreatShortName(retreat.name)) - Day \(dayNum), \(weekday)"

            let displayName =
                Auth.auth().currentUser?.displayName?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                ?? ""

            guard !selfVolunteerId.isEmpty else {
                applyDemo(calendar: calendar, today: today, displayName: displayName.isEmpty ? nil : displayName)
                return
            }

            let dates = volunteerHomeRetreatDates(retreat: retreat, calendar: calendar)
            var mine: [VolunteerHomeAssignment] = []
            for iso in dates {
                let day = try await api.getScheduleByDay(retreatId: retreat.id, date: iso)
                for item in day.items {
                    guard item.assignments?.contains(where: { $0.volunteerId == selfVolunteerId }) == true else {
                        continue
                    }
                    mine.append(
                        VolunteerHomeAssignment(
                            date: iso,
                            label: volunteerHomeJobLine(item: item),
                        ),
                    )
                }
            }

            if mine.isEmpty {
                applyDemo(calendar: calendar, today: today, displayName: displayName.isEmpty ? nil : displayName)
                return
            }

            let volunteerName =
                displayName.isEmpty
                    ? (mine.first.flatMap { _ in "Volunteer" } ?? "Volunteer")
                    : displayName
            let todayCount = mine.filter { $0.date == todayIso }.count
            let shiftWord = mine.count == 1 ? "shift" : "shifts"
            summaryLine = "\(volunteerName) - \(mine.count) \(shiftWord) - \(todayCount) today:"
            todayJobLines = mine.filter { $0.date == todayIso }.map(\.label)
        } catch let err {
            applyDemo(calendar: calendar, today: today)
            error = err.localizedDescription
        }
    }

    private func applyDemo(calendar: Calendar, today: Date, displayName: String? = nil) {
        usingDemoData = true
        let weekday = volunteerHomeWeekdayShort(today: today, calendar: calendar)
        retreatDayLine = "JH Summer 2026 - Day 2, \(weekday)"
        let name = displayName ?? "David Lewis"
        summaryLine = "\(name) - 2 shifts - 1 today:"
        todayJobLines = ["Kitchen Full Clean - End of Day"]
    }
}

private struct VolunteerHomeAssignment {
    let date: String
    let label: String
}

// MARK: - Formatting

private func volunteerHomeJobLine(item: ScheduleDayItem) -> String {
    let raw = item.task.jobTitle ?? item.job.title
    let title =
        raw
            .replacingOccurrences(of: "—", with: " - ")
            .replacingOccurrences(of: "–", with: " - ")
    let slot = item.task.slotLabel ?? item.slot.label
    if slot.isEmpty { return title }
    return "\(title) - \(slot)"
}

private func volunteerHomeRetreatShortName(_ name: String) -> String {
    name
        .replacingOccurrences(of: " Retreat", with: "", options: .caseInsensitive)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

private func volunteerHomeDayNumber(retreat: Retreat, today: Date, calendar: Calendar) -> Int {
    guard let startStr = retreat.startDate,
          let start = volunteerDateAtNoonFromAPIDay(startStr, calendar: calendar) else {
        return 1
    }
    let startDay = calendar.startOfDay(for: start)
    let days = calendar.dateComponents([.day], from: startDay, to: today).day ?? 0
    return max(1, days + 1)
}

private func volunteerHomeWeekdayShort(today: Date, calendar: Calendar) -> String {
    let f = DateFormatter()
    f.calendar = calendar
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "EEE"
    return f.string(from: today)
}

private func volunteerHomeEffectiveToday(calendar: Calendar) -> Date {
    if let iso = JewelHeartConfig.volunteerHomeTestToday,
       let d = volunteerDateAtNoonFromAPIDay(iso, calendar: calendar) {
        return calendar.startOfDay(for: d)
    }
    return calendar.startOfDay(for: Date())
}

private func volunteerHomePickRetreat(_ retreats: [Retreat], today: Date, calendar: Calendar) -> Retreat? {
    let todayIso = volunteerApiDayString(from: today, calendar: calendar)
    if let inRange = retreats.first(where: { r in
        volunteerHomeDateInRetreat(iso: todayIso, retreat: r)
    }) {
        return inRange
    }
    return retreats.first
}

private func volunteerHomeDateInRetreat(iso: String, retreat: Retreat) -> Bool {
    guard let start = retreat.startDate, let end = retreat.endDate else { return false }
    return iso >= start && iso <= end
}

private func retreatCalendar(timezoneId: String) -> Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: timezoneId)
        ?? TimeZone(identifier: JewelHeartConfig.jewelheartDefaultTimeZoneId)
        ?? .gmt
    return c
}

private func volunteerApiDayString(from date: Date, calendar: Calendar) -> String {
    let y = calendar.component(.year, from: date)
    let m = calendar.component(.month, from: date)
    let d = calendar.component(.day, from: date)
    return String(format: "%04d-%02d-%02d", y, m, d)
}

private func volunteerDateAtNoonFromAPIDay(_ iso: String, calendar: Calendar) -> Date? {
    let parts = iso.split(separator: "-").map(String.init)
    guard parts.count == 3,
          let y = Int(parts[0]),
          let m = Int(parts[1]),
          let d = Int(parts[2]) else { return nil }
    return calendar.date(from: DateComponents(year: y, month: m, day: d, hour: 12))
}

private func volunteerHomeRetreatDates(retreat: Retreat, calendar: Calendar) -> [String] {
    guard let startStr = retreat.startDate, let endStr = retreat.endDate,
          let start = volunteerDateAtNoonFromAPIDay(startStr, calendar: calendar),
          let end = volunteerDateAtNoonFromAPIDay(endStr, calendar: calendar) else {
        return []
    }
    var dates: [String] = []
    var d = calendar.startOfDay(for: start)
    let endDay = calendar.startOfDay(for: end)
    while d <= endDay {
        dates.append(volunteerApiDayString(from: d, calendar: calendar))
        guard let next = calendar.date(byAdding: .day, value: 1, to: d) else { break }
        d = next
    }
    return dates
}
