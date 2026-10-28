# Putting the demo app on Google Play

The demo app (`DEMO_MODE`) needs no server: it carries a sample school and works offline. It goes
to the **Internal testing** track first: up to 100 people you invite by email install it from the
Play Store like any app, with no review wait.

| Item | Value |
|---|---|
| Package name (permanent after the first upload) | `com.manashsingh.schoolerp` |
| App name on the phone | Bastaa |
| Build | GitHub Actions → **Android** workflow → artifact `schoolos-demo-<n>` (`app-release.aab`) |
| Listing text and graphics | [listing.md](listing.md), `icon-512.png`, `feature-graphic.png`, `screenshots/` |
| Privacy policy | The website's privacy page, e.g. `https://school-erp-hazel-nu.vercel.app/privacy` (text also in [privacy-policy.md](privacy-policy.md)) |

## 1. One-time setup

1. **Upload key → GitHub secrets.** Add the four secrets (`ANDROID_KEYSTORE_BASE64`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) under the repository's
   **Settings → Secrets and variables → Actions**. Keep the `.jks` file and password safe: every
   future version must be signed with the same key. (Lost it? With Play App Signing, Google can
   reset the upload key.)
2. **Google Play developer account** at <https://play.google.com/console/signup>: $25 once, a
   personal account is fine for the demo. Google verifies your identity (ID document, phone, and
   sometimes a check on an Android phone). This can take a few days.

## 2. Build the bundle

GitHub → **Actions** → **Android** → **Run workflow** (or push a change under `apps/mobile`).
When it finishes, download the `schoolos-demo-<n>` artifact from the run page and unzip it:
inside is `app-release.aab`. A yellow warning about a debug key means the secrets are missing.

## 3. Play Console

1. **Create app**: name "Bastaa", default language English (India), App, Free.
2. **Test and release → Testing → Internal testing → Create new release**. Accept **Play App
   Signing** (Google keeps the real signing key). Upload `app-release.aab`, release name "1.0.0
   demo", save and roll out.
3. **Testers** tab: create an email list with your team's Gmail addresses, save, then copy the
   **join link** and send it to them. They open it on their phone, accept, and install from Play.
4. Play asks for the **app content** forms (Dashboard → "Finish setting up your app"):

   | Form | Answer |
   |---|---|
   | Privacy policy | The website's privacy page: `https://school-erp-hazel-nu.vercel.app/privacy` (or your domain's `/privacy` once you have one) |
   | App access | All functionality is available without special access (demo buttons, no login) |
   | Ads | No ads |
   | Content rating | Category "Education/Reference"; answer No to violence, user content sharing, location, purchases → rated for everyone |
   | Target audience | **18 and over** only (parents and staff). Don't pick children's ages: that adds the Families policy |
   | Data safety | No data collected, no data shared (true for the demo; redo it for the real app) |
   | Financial features | None (demo payments are simulated) |
   | Government app | No |
   | Advertising ID | No |

5. **Store listing**: paste from [listing.md](listing.md) and upload the icon, feature graphic and
   screenshots.

## Later

- **Going public** (Production) on a personal account needs a closed test with at least 12 testers
  for 14 days first. An organisation account (once the company is registered) skips that.
- **Each new upload** needs a higher version code. The workflow uses the run number, so every
  build counts up by itself.
- **The real app**: set the repository variable `API_URL` (Settings → Secrets and variables →
  Actions → Variables, e.g. `https://api.<domain>`), then **Run workflow** with variant **real**.
  Same package name, so it replaces the demo for your testers. Push needs the `FIREBASE_*`
  variables too (SETUP-LATER #12). Update the data safety form and privacy policy first: the real
  app handles school data.
- **New demo data** after app changes: start the local API with the seeded demo school and run
  `node apps/mobile/tool/record_demo.mjs` (see `apps/mobile/README.md`).
