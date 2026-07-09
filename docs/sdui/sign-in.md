# Sign-in screen spec

> Updated 2026-07-08.

## Line 1 — app header

Full-width blue bar, gold font: **JH Retreat {date span} - Day {n} {weekday}**

Example: `JH Retreat 2026.7.20-26 - Day 2 Tue`

## Line 2

Full-width blue bar, white font: **Choose sign-in method:**

## Line 3

Centered maroon **By Google** and **By Email** — radio-style (one selected: dark maroon; other: light maroon). These choose the method only; they do not sign in.

## Line 4

When **By Email** is selected: centered gray input **30 characters wide**, placeholder **Enter email address here**. Hidden when **By Google** is selected.

## Line 5

Centered maroon **Sign in** button:

- **By Google** selected → **Sign in** enabled (dark maroon) → Google OAuth.
- **By Email** selected + valid email → **Sign in** enabled → sends magic link.
- **By Email** selected + empty or invalid email → **Sign in** disabled (light maroon).

## Lines 6–7

- Success (bold, two lines): **Email sent. Click link in it** / **Check spam. Expires in n min**
- Error: **Error: whatever, fix & retry**

## Magic link flow

1. User selects **By Email**, enters address, taps **Sign in** → Firebase sends link.
2. User opens link → bootstrap → onboarding (first time) or Home.
3. Later email sign-ins → Home directly when profile is confirmed.
