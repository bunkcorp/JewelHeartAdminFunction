import UIKit

enum JewelHeartRootPresenter {
    /// Top-most view controller for presenting Google Sign-In.
    @MainActor
    static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
        guard let root = window?.rootViewController else { return nil }
        return root.jewelheartTopPresented()
    }
}

private extension UIViewController {
    func jewelheartTopPresented() -> UIViewController {
        if let presented = presentedViewController {
            return presented.jewelheartTopPresented()
        }
        if let nav = self as? UINavigationController, let visible = nav.visibleViewController {
            return visible.jewelheartTopPresented()
        }
        if let tab = self as? UITabBarController, let selected = tab.selectedViewController {
            return selected.jewelheartTopPresented()
        }
        return self
    }
}
