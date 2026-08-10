---
status: accepted
---

# US/China comparison columns run side-by-side, even on mobile

Ticket 07 and the original `CulturalComparisonBody` implementation stacked the US/China comparison blocks vertically on mobile, reasoning that the app has no separate desktop layout so nothing would ever need a side-by-side breakpoint. That reasoning rested on a UI reference image that turned out to be a tablet-width screenshot, mistaken for a phone mockup. The actual phone-width mockup (2026-08-07) places US, China, and the "why" explanation in three narrow side-by-side columns, so the Notice page's comparison layout is side-by-side at all viewport widths — text size and spacing shrink to fit rather than falling back to a stacked layout. This applies to Notice's Cultural Insight Cards specifically, not to the "no separate desktop layout" principle itself.
