# Bastaa mobile (Flutter)

One app for parents and teachers (docs/01 §7). After sign-in the user picks a school; the home,
bottom bar and screens follow their role (someone who is both switches in Profile).

| | Parent | Teacher |
|---|---|---|
| Home | today (attendance, timetable), fees due, homework, latest result | registers to take, today's classes, marks to enter |
| Tabs | Academics (attendance calendar, homework, timetable, results + report card) · Fees (pay whole bills, receipts) | Attendance (**works offline**) · Classes (homework with camera photos, marks entry) |
| Both | Notifications inbox (tap opens the right tab) · Profile (documents, devices, switch school, sign out) | |

## Run it

Needs Flutter 3.47+ (`~/development/flutter`, already on PATH in `~/.zshrc`) and the local API on :4000.

```bash
cd apps/mobile
flutter run -d chrome                         # quickest: in a browser (API allows localhost CORS in development)
flutter run -d emulator-5554                  # Android emulator (API at 10.0.2.2:4000 automatically)
flutter run --dart-define=API_URL=https://api.example.in   # any other API
flutter test && flutter analyze
```

iOS and Android builds need Xcode / Android Studio (docs/SETUP-LATER.md). The Play Store bundle is
built by the **Android** GitHub Actions workflow instead ([docs/play-store](../../docs/play-store/README.md)).

## Demo mode (no server)

```bash
flutter run -d chrome --dart-define=DEMO_MODE=true
```

The app answers from a sample school bundled in `assets/demo/` (`lib/core/demo_api.dart`); the
sign-in screen offers "Explore as a parent / a teacher". This is the build on Google Play until the
API is deployed.

- **Dates** move forward by whole weeks, so "today" always has data on the right weekday.
- **Changes** (attendance, marks, messages, meetings, reminders, a sandbox payment) stay in memory
  until the app closes. Downloads (receipts, report cards) say they need the real app.
- **New screens or routes**: record the data again. Run the API with the seeded demo school
  (`pnpm db:seed`, see HANDOFF §3), then `node apps/mobile/tool/record_demo.mjs`. Add the new route
  to that script first if the demo should show it. `test/demo_api_test.dart` parses every recorded
  answer with the app's models.

## How it's built

- `lib/core/` — `ApiClient` (dio; Bearer token, one shared refresh on 401, `{ data }` unwrapping, `ApiException`), `TokenStore` (refresh token in Keychain/Keystore via `flutter_secure_storage`, access token in memory only), `SessionController` (sign in with password or one-time code → school → `/me`), models mirroring `packages/contracts`, theme from the design tokens (light/dark, school accent), `AttendanceQueue`.
- **Offline attendance** — the class list is kept on the phone; a submitted register is sent at once or queued with a `clientMutationId` (the API ignores replays), and sent when the app opens or returns to the front, or on "Sync now". A register the school refuses (e.g. edit window closed) stays visible with the reason until the teacher discards it.
- **Payments** — `GET /v1/app/config` says which checkout: the sandbox sheet (development) or Razorpay Checkout (`razorpay_flutter`) with the school's own key; the API verifies the signature either way.
- **Push** — `lib/core/push.dart` (Firebase Messaging), on only when the build carries the
  `FIREBASE_*` dart-defines (the Android workflow passes them for the real app). After sign-in it
  asks permission, registers the token, and a tapped notification opens the screen in its `route`.
- **Forced update** — the app compares its version with `minVersion` from `/v1/app/config`.
- **API drift** — `apps/api/test/mobile-routes.test.ts` fails if the app calls a route the API doesn't have; `test/models_test.dart` parses real response shapes.

State is Riverpod 3; data screens are `FutureProvider`s with pull-to-refresh and "Try again" on errors.
