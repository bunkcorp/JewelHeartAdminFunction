import SwiftUI

struct JewelHeartOnboardingView: View {
    let draft: VolunteerBootstrapResponse
    let onComplete: () -> Void

    @State private var firstName: String
    @State private var lastName: String
    @State private var phone: String
    @State private var code = ""
    @State private var statusMessage = ""
    @State private var isError = false
    @State private var busy = false

    private let api = JewelHeartAPI()

    init(draft: VolunteerBootstrapResponse, onComplete: @escaping () -> Void) {
        self.draft = draft
        self.onComplete = onComplete
        _firstName = State(initialValue: draft.firstName)
        _lastName = State(initialValue: draft.lastName)
        _phone = State(initialValue: draft.phone)
    }

    private var displayEmail: String {
        let auth = draft.authEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        if !auth.isEmpty { return auth }
        return draft.email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VolunteerAuthScaffold {
            VolunteerBlueBar(text: "App onboard (NOT retreat registration)")
                .padding(.top, 6)

            VolunteerGrayTextField(placeholder: "First name.", text: $firstName)
                .textContentType(.givenName)

            VolunteerGrayTextField(placeholder: "Last name.", text: $lastName)
                .textContentType(.familyName)

            if !displayEmail.isEmpty {
                Text(displayEmail)
                    .font(.system(size: 17, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .padding(.vertical, 6)
            }

            VolunteerGrayTextField(placeholder: "Phone #", text: $phone)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)

            VolunteerMaroonButton(title: "Send code to phone", enabled: !busy) {
                Task { await sendCode() }
            }

            VolunteerGrayTextField(placeholder: "Enter code.", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)

            VolunteerMaroonButton(title: "Submit code", enabled: !busy) {
                Task { await submitCode() }
            }

            if !statusMessage.isEmpty {
                VolunteerAuthMessage(text: statusMessage, isError: isError)
            }

            if busy {
                ProgressView()
                    .padding(.top, 12)
            }
        }
    }

    @MainActor
    private func sendCode() async {
        busy = true
        statusMessage = ""
        isError = false
        guard let normalized = JewelHeartVolunteerPhone.normalizeE164(phone) else {
            statusMessage = "Enter a valid phone number."
            isError = true
            busy = false
            return
        }
        do {
            statusMessage = try await api.sendOnboardingPhoneOtp(phone: normalized)
            isError = false
        } catch {
            statusMessage = error.localizedDescription
            isError = true
        }
        busy = false
    }

    @MainActor
    private func submitCode() async {
        busy = true
        statusMessage = ""
        isError = false

        let fn = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let ln = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        let phoneRaw = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        let otp = code.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !fn.isEmpty else {
            statusMessage = "Enter your first name."
            isError = true
            busy = false
            return
        }
        guard !ln.isEmpty else {
            statusMessage = "Enter your last name."
            isError = true
            busy = false
            return
        }
        guard let normalized = JewelHeartVolunteerPhone.normalizeE164(phoneRaw) else {
            statusMessage = "Enter a valid phone number."
            isError = true
            busy = false
            return
        }
        guard otp.range(of: #"^\d{6}$"#, options: .regularExpression) != nil else {
            statusMessage = "Enter the 6-digit code from your text."
            isError = true
            busy = false
            return
        }
        guard !displayEmail.isEmpty else {
            statusMessage = "Email address is missing from sign-in."
            isError = true
            busy = false
            return
        }

        do {
            try await api.verifyOnboardingPhoneOtp(phone: normalized, code: otp)
            try await api.completeOnboarding(firstName: fn, lastName: ln, email: displayEmail, phone: phoneRaw)
            onComplete()
        } catch let err as JewelHeartAPIError {
            switch err {
            case .http(_, let body):
                if body?.localizedCaseInsensitiveContains("Incorrect code") == true {
                    statusMessage = "Incorrect code, retry"
                } else {
                    statusMessage = err.localizedDescription
                }
            default:
                statusMessage = err.localizedDescription
            }
            isError = true
        } catch {
            if error.localizedDescription.localizedCaseInsensitiveContains("Incorrect code") {
                statusMessage = "Incorrect code, retry"
            } else {
                statusMessage = error.localizedDescription
            }
            isError = true
        }
        busy = false
    }
}
