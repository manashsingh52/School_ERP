# Fee demo: rehearsal notes

Homepage section "From the counter to the phone" (`fee-demo.tsx`), built with the vendored
Stageshow kit (`src/vendor/stageshow`).

- **Gold copied:** `device-pair` (window pinned top-left off the bottom, phone straddling its right
  edge over filler, `LockScreen stack="top"`). Button motion from `form-error` (layers crossfading in
  one cell, the check holding still); beats in the style of `hero-demo`.
- **Changed:** Bastaa's own look (demo school emerald, Inter, the real sidebar with the school's
  initial, Lucide icons as in the product), the real Collect screen (student, bill, Paid by, UPI
  reference, Collect), a reserved lane under the button for the receipt line, the Bastaa mark on the
  notification. Plays once in view, holds the payoff; the poster is the payoff; "Play again" remounts.
  Soft tile behind the scene (as the gold) so the bottom crop never slices the window's shadow.
- **Checked:** stills at 1366 (light, dark) and 390 (light, Hindi page), the beat sequence on a
  contact sheet, the reduced-motion poster, no overflow outside the stage. The cursor rests on empty
  surface and never covers a word; the notification is whole at both widths; dark mode uses dark ink
  on the bright green.
- **Not checked:** upstream `film.mjs --gate` (its scripts weren't run here; filmed with our own
  Playwright instead), frame-by-frame step-through at 60 ms, Safari.
