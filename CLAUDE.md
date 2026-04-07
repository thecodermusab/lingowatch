# Project Instructions

## Mobile vs Desktop Design

Mobile and desktop layouts are intentionally different — they are not the same design scaled up or down.

- Desktop uses the left sidebar (`lg:block`) for navigation.
- Mobile uses a slide-in drawer triggered by the hamburger button in the top header.
- Pages often have completely separate mobile and desktop JSX blocks (e.g. `hidden lg:block` for desktop, `lg:hidden` for mobile).
- Do not assume a change to one layout applies to the other.

## Asking Before Assuming

If something about the design intent is unclear — especially on mobile — ask before making changes. The user has specific preferences for how things look and behaves on mobile that may not be obvious from the code alone.
