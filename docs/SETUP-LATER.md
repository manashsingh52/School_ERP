# Setup later — accounts & keys checklist

Everything the code already has a **slot** for but needs a real account, key or decision from you.
Until each item is filled in, the app runs with the local fallback shown (fine for development).

Search the code for `⏸` to find every slot.

| # | What | Needed for | Where it goes | Until then |
|---|---|---|---|---|
| 1 | ~~**GitHub login on this Mac**~~ ✅ done (manashsingh52/School_ERP) | Pushing code | Token needs the `repo` **and** `workflow` scopes | — |
| 2 | **Docker Desktop** (needs Mac admin password) | Optional: `docker-compose.yml` services | [docker.com](https://www.docker.com/products/docker-desktop/) → Apple Silicon | `pnpm db:start` (embedded PostgreSQL) |
| 3 | **Company registration** | DLT, Razorpay test account, app stores | — | — |
| 4 | **DLT registration + MSG91**: register as an entity on a telecom DLT portal (PAN + GST/Udyam, about ₹5,900, 2–7 days), a 6-letter sender ID, and two templates: the OTP (`Your SchoolOS code is {#var#}`) and notifications (one variable `##message##`) | Real SMS one-time codes and SMS notifications | `apps/api/.env` / Secret Manager: `OTP_PROVIDER=msg91`, `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_SMS_TEMPLATE_ID` (code: `otp-sender.ts`, `channel-gateway.ts`) | Development: codes in the API log. Production: `OTP_PROVIDER=none`: password sign-in, and the school office makes one-time **sign-in codes** (Settings → Users → a person → Make code) for first sign-in or a forgotten password |
| 5 | **Domain** (replacing `schoolos.in`) + Cloudflare | School subdomains in staging/prod | `APP_BASE_DOMAIN` in both `.env` files; Cloudflare DNS | `*.localhost` |
| 6 | **Google Cloud projects** `schoolos-staging` / `schoolos-prod` + budget alerts ($50 / $80 / $100) | Hosting | **Scripted:** `infra/README.md` — `bootstrap.sh`, `deploy.sh roles`, `deploy.sh` (≈1 hour) | Local only |
| 7 | **Cloud Storage buckets** (private + public), service-account roles, bucket CORS for `https://*.<domain>` | Real file storage | `STORAGE_DRIVER=gcs`, `GCS_PROJECT_ID`, `GCS_PRIVATE_BUCKET`, `GCS_PUBLIC_BUCKET` — see `apps/api/src/core/storage/gcs.driver.ts` header | Files on local disk (`apps/api/.data/storage`) |
| 8 | **Redis** (Upstash) — *optional* | Only if Postgres-backed queues ever become a bottleneck | `QUEUE_BACKEND=redis`, `REDIS_URL` | Queues run in PostgreSQL (BullMQ 6) — no Redis needed |
| 9 | **Email provider** (Resend) + domain SPF/DKIM/DMARC | Notification emails | `apps/api/.env`: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` — code in `apps/api/src/core/notify/channel-gateway.ts` | `EMAIL_PROVIDER=console` logs emails; in-app inbox always works |
| 10 | **Sentry** project | Error monitoring (deploy time) | `SENTRY_DSN` (added at deploy) | Errors in logs with `supportRef` |
| 11 | **Razorpay account** (test, then live) per school | Real online fee payments | API: `PAYMENTS_GATEWAY=razorpay`, `PAYMENT_SECRETS_KEY` (⏸ Secret Manager), `PUBLIC_API_URL`; each school enters its keys in Payments → Online payments and adds the shown webhook URL + secret in Razorpay | `PAYMENTS_GATEWAY=mock` sandbox: same flow, no real money |
| 12 | **Firebase project + Apple Developer account** | Push notifications, iOS app (Phase 7) | API: `PUSH_PROVIDER=fcm` + service account (slot in `channel-gateway.ts`). App: `flutterfire configure` in `apps/mobile` (adds `google-services.json` / `GoogleService-Info.plist`), then `firebase_messaging` → `PUT /v1/me/devices` (API ready) | `PUSH_PROVIDER=console`; the in-app inbox works; tokens table stays empty |
| 19 | **Gemini API key** (Google AI Studio, or Vertex AI on the GCP project — uses the $300 credit) | Real AI answers and worksheet drafts (Phase 8) | API `.env`: `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, optionally `AI_MODEL` (default `gemini-2.5-flash`). Then run `pnpm --filter @schoolos/api ai:eval` and check every case passes before switching `ai_assistant` on for a school | `AI_PROVIDER=mock`: offline rules answer common questions from real data (refused in production) |
| 16 | **Xcode** (App Store, ~15 GB, needs Mac admin password) + CocoaPods | iPhone builds, iOS simulator | then `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer && sudo xcodebuild -runFirstLaunch` | App runs in Chrome (`flutter run -d chrome`) and in tests |
| 17 | **Android Studio** (Android SDK + an emulator) | Local Android builds and the emulator | then `flutter doctor --android-licenses` | The Play bundle is built by the **Android** GitHub Actions workflow |
| 18 | **Google Play** (a personal account works; an organisation account needs #3) **+ App Store Connect** (needs #3) | Store listings, TestFlight / internal testing | Play: steps in [play-store/README.md](play-store/README.md), package `com.manashsingh.schoolerp` (permanent), upload key in GitHub secrets. Then `MOBILE_ANDROID_URL` / `MOBILE_IOS_URL` / `MOBILE_MIN_VERSION` in the API `.env` | The demo build (`DEMO_MODE`) goes to internal testing without a server |
| 13 | **Legal review** — DPA, privacy policy, DPDP Act | Before the first real school goes live | docs/09 §7 | — |
| 14 | **Product name** | Branding | Replace "SchoolOS" / `schoolos.in` | Placeholder |
| 15 | **DNS for `admin.<domain>`** (super-admin console), ideally behind Cloudflare Access / an IP allow-list | Platform console in staging/prod | Same `APP_BASE_DOMAIN`; the console is served by the web app on the `admin` subdomain | `http://admin.localhost:3000` (seed: `superadmin@schoolos.local`, `support@schoolos.local`) |
| 20 | **Video meetings host** — *optional* | Parent–teacher video meetings without the "sign in to start" step | `MEETING_BASE_URL` (API `.env`) → your own Jitsi (Docker, a small VM) or a Jitsi-as-a-Service tenant | Public `https://meet.jit.si` (free): works now; the first person to join signs in with Google/GitHub to open the room. Rooms are random per meeting |
| 21 | **Move the project off the iCloud-synced Desktop** | Safety of the local database | e.g. `~/Developer/schoolerp` (then reopen it there) | iCloud makes conflict copies inside `apps/api/.data/pg` — a live database must not be synced |

## Secrets that must be **regenerated** for staging/production

Never reuse the local values. Store them in Google Secret Manager.

- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` — `pnpm --filter @schoolos/api keys:generate`
- `OTP_PEPPER`, `BFF_SHARED_SECRET` (same value in API and web), `STORAGE_SIGNING_SECRET` (local driver only)
- Database role passwords (`schoolos_owner`, `schoolos_app`, `schoolos_platform`)
