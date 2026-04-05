@import FirebaseCore;

@interface JewelHeartFirebaseBootstrap : NSObject
@end

@implementation JewelHeartFirebaseBootstrap

/// Runs when the ObjC runtime maps app classes — earlier than Swift `@main` delegate `init`
/// in some launch orders, and complements the C `constructor` below.
+ (void)load {
    if ([FIRApp defaultApp] == nil) {
        [FIRApp configure];
    }
}

@end

/// Backup: runs during image init before `UIApplicationMain`.
__attribute__((constructor)) static void JewelHeartFirebaseConfigureEarly(void) {
    if ([FIRApp defaultApp] == nil) {
        [FIRApp configure];
    }
}
