# Onboarding screen spec

> Updated 2026-07-08.

## Line 1 — app header

Full-width blue bar, gold font: **JH Retreat {date span} - Day {n} {weekday}**

Example: `JH Retreat 2026.7.20-26 - Day 2 Tue`

## Line 2

Full-width blue bar, white font: **App onboard (NOT retreat registration)**

## Line 3

Text inputs **First name** and **Last name**, 15 characters each (gray boxes, square corners).

Read-only sign-in email shown on the line below the name fields.

## Line 4

- Maroon **Continue to app** → completes onboarding → **Home**
- Blue **Cancel** → signs out → **Sign-in** screen (profile not confirmed; user can sign in again)

Sign-in email comes from Firebase auth (not shown on this screen).
