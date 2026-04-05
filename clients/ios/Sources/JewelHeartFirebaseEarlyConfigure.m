@import Foundation;

/// Empty class so `JewelHeartFirebaseBootstrapTouch` keeps this translation unit linked.
/// Do **not** call `[FIRApp configure]` in `+load` or `constructor` — that runs before
/// `UIApplication.shared.delegate` exists and triggers AppDelegateSwizzler warnings (I-SWZ001014).
@interface JewelHeartFirebaseBootstrap : NSObject
@end

@implementation JewelHeartFirebaseBootstrap
@end

void JewelHeartFirebaseBootstrapTouch(void) {
    [JewelHeartFirebaseBootstrap class];
}
