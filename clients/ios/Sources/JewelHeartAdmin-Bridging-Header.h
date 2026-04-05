#import <Foundation/Foundation.h>

/// Defeats linker dead-stripping of `JewelHeartFirebaseBootstrap` (see JewelHeartFirebaseEarlyConfigure.m).
void JewelHeartFirebaseBootstrapTouch(void);
