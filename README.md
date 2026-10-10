# 🌟 PMC लीला
> **The Official Campus Social App for MANIT Bhopal Students**

**PMC लीला** is a mobile application built with **React Native (Expo)** and **Node.js / Socket.io**, designed around MANIT campus culture.

See [Safety & Privacy](./SAFETY-AND-PRIVACY.md) for what anonymity means in PMC chat, the protections in the app, and their limitations.

---

## 🏛️ Features Overview

### 1. ❤️ Piya Milan Chauraha (PMC) — 1-on-1 Pseudonymous Chat
* **The Concept:** Named after MANIT's iconic meeting landmark—Piya Milan Chauraha. Verified students can get paired for a one-to-one live conversation. Chat partners see each other's chosen PMC chat name, gender, and academic year—not registered email addresses or scholar numbers in the chat interface. This is pseudonymity between chat partners, not anonymity from the service.
* **WhatsApp / Instagram Style Messaging:**
  * Rich text messaging with timestamps and double ticks (`✓✓`).
  * Instant photo sharing directly from phone gallery / camera.
  * Real-time typing indicators (*"Hostel 4 Maggi Chef is typing..."*).
  * Campus-themed pseudonyms (*PMC Chai Lover*, *SAC Rockstar*, *Nescafe Philosopher*, *Hostel 7 Phantom*).
* **🔥 Ephemeral Chat Session:**
  * Once either student taps **"Agla / Next"**, **"End Chat"**, or disconnects:
  * The backend removes the active room state from its running memory. Chat text and images are not written to a persistent chat-history database by the current app backend.
  * This does not erase copies a participant may make, guarantee immediate removal of every technical log or backup, or make the conversation end-to-end encrypted.
  * Students return to the matching pool using their chosen PMC chat names.

### 2. 🎬 Leela — Campus Video Reels
* **The Concept:** Vertical short-form campus video feed showcasing fest highlights (Maffick, Technosearch), hostel life banter, dance rehearsals, and comedy.
* **Full-Screen 9:16 Snapping Feed:**
  * Native video playback with auto-play for active reel and automatic pause for offscreen clips.
  * Mute / unmute audio toggle.
  * Animated like button (heart) with live counter.
  * Slide-up campus comments drawer to drop gossip & banter.
  * **"Post to Leela" Editor:** Trim a selected clip and choose 9:16, square, or full-frame output before publishing with a caption. Add music, choose a music segment to match the video length, preview the mix, and keep original audio, music, both, or mute. Publishing continues in the background with progress shown on Leela.
  * **Separate identities:** PMC chat and Leela have different usernames, editable from **Me**; reels and comments use the Leela username.
  * **Your reels:** Open **Me → My uploaded reels** to tap and watch or delete reels you posted.
  * The server encodes and stores only the selected clip range; bundled FFmpeg is installed with the server dependencies.

Female students can report one account from PMC chat in any rolling 24-hour period. A reported account is blocked from PMC chat for 48 hours; Leela and other account features remain available.

Android uses secure-window protection against ordinary screenshots and screen recordings in the app; it cannot prevent recording with another device. iOS does not provide a reliable API for apps to prevent screenshots.

Students can request account deletion from **Me → Settings**. The account stays active while the request is pending; PMC admins can approve immediate deletion or reject it, and unresolved requests are automatically deleted after 24 hours. The verified email's original gender remains locked after deletion to prevent re-registration with a different gender.

### 3. 🛡️ MANIT Campus Pass & Student Verification
* Registration uses the configured MANIT student-email verification flow. Account email and scholar-number information are not shown in the PMC chat interface, but the service can associate verified accounts with their chat names.

---

## 🚀 How to Run the App

### Step 1: Start the Backend Server
Open a terminal in `a:\pmcleela\server`:
```bash
cd server
npm install
npm run dev
```
* This local-only command uses `server/data/` JSON files and local uploads. It ignores database and R2 credentials from `.env`, does not send real OTP emails or push notifications, and does not run Prisma migrations. Production remains on `npm start`.
* Backend runs at: `http://localhost:5000` (and `http://<your-wifi-ip>:5000`)
* Socket.io active for PMC real-time matchmaking.
* Express REST API active for Leela reels and uploads.

### Step 2: Start the Mobile App (Expo)
Open a second terminal in `a:\pmcleela\mobile`:
```bash
cd mobile
npx expo start
```

### Step 3: Open on Your Phone
1. Install **Expo Go** from Google Play Store or Apple App Store.
2. Scan the QR code shown in the terminal while the phone and computer are on the same Wi-Fi network.
3. The app will load instantly on your phone with live reload!

> **Tip for Wi-Fi connection:** Expo Go automatically uses the computer address Expo CLI advertises to reach the local backend. Keep the phone and computer on the same Wi-Fi, start Expo in LAN mode, and allow Node.js through Windows Firewall on port `5000` if prompted. The local app intentionally ignores `EXPO_PUBLIC_API_URL` so local tests cannot accidentally write to production.

For production builds, use the EAS `preview` profile and set `EXPO_PUBLIC_API_URL` in its EAS **preview** environment to the deployed HTTPS API URL. It is a public build-time setting, not a secret. If it is unset, the app retains the Render URL as a compatibility fallback.

## Deploy the Backend on Oracle Cloud Free Tier

The server can run on an Oracle Cloud Always Free eligible Ubuntu VM, with Nginx
terminating HTTPS and proxying API and Socket.IO traffic. PostgreSQL remains on
Supabase and uploaded media remains in Cloudflare R2, so the VM disk is not the
source of truth for application data or media.

Follow the complete VM, firewall, systemd, Nginx, HTTPS, and EAS setup in
[`deploy/oracle-cloud/README.md`](./deploy/oracle-cloud/README.md). It includes
the production environment variables and commands for updating the service.
After the API is available at your HTTPS domain, set `EXPO_PUBLIC_API_URL` in the
EAS **preview** environment before building the student APK. The build config
also derives the Android reel App Link domain from that URL.

## Deploy the Backend on Render Free

The repository includes a Render Blueprint at [`render.yaml`](./render.yaml). In Render, create a **Blueprint** from the GitHub repository and select the free service. The Blueprint configures:

* Root directory: `server`
* Node.js: 22 (pinned in `server/.node-version` and `server/package.json`)
* Build command: `npm ci`
* Start command: `npm start`
* Health check path: `/api/health`
* Upload limit: 100 MB; published reel length is limited to 40 seconds.
* Profile images: JPEG, PNG, or WebP up to 5 MB; stored privately in Cloudflare R2.
* Private Cloudflare R2 bucket; video playback uses expiring signed URLs.

If creating a Web Service manually instead, use the same root directory, commands, and health-check path. Add the following secret environment variables in Render (never commit them or add them to the APK):

* `R2_BUCKET_NAME`: the name of the Cloudflare R2 bucket for reel videos, profile avatars, and app releases.
* `R2_ACCOUNT_ID`: your Cloudflare account ID. The S3 endpoint is constructed as `https://<account-id>.r2.cloudflarestorage.com`.
* `R2_ACCESS_KEY_ID`: the access key ID from an R2 S3 API token scoped to this bucket with object read, write, and delete permissions.
* `R2_SECRET_ACCESS_KEY`: the secret access key from the same R2 token. Keep both keys private and configure them only as Render environment variables.
* `R2_SIGNED_URL_TTL_SECONDS`: optional signed playback link lifetime; defaults to 43200 seconds.
* `MAX_APP_RELEASE_MB`: optional maximum uploaded APK size; defaults to 250 MB.
* `DATABASE_URL`: the Supabase PostgreSQL **Transaction pooler** URI (shared pooler, port `6543`) with `?pgbouncer=true&sslmode=require`. Prisma uses this IPv4-accessible URI for application queries. Replace its password placeholder with your rotated database password.
* `DIRECT_URL`: the Supabase PostgreSQL **Session pooler** URI (shared pooler, port `5432`) with `?sslmode=require`. Prisma uses this for schema migrations. Use the same rotated password and keep this server-side as a Render secret.
* `BREVO_API_KEY`: required for student OTP and password-reset emails. Also set `FROM_EMAIL` to the sender address verified with Brevo. The backend sends its own compact PMC Leela-themed HTML for both emails; no Brevo template IDs or Render template variables are needed. Password-reset requests report delivery/configuration failures rather than claiming an email was sent when Brevo rejects it.
* `PMC_ADMIN_EMAIL`, `PMC_ADMIN_PASSWORD`, `PMC_ADMIN_SESSION_SECRET`: configure the dedicated admin login only in Render. Use a unique password of at least 16 characters and a randomly generated session secret of at least 32 characters. Never put these values in the admin APK or repository.
* `PMC_USER_SESSION_SECRET`: required for production student sign-in sessions. Set a separate random secret of at least 32 characters in Render; do not reuse the admin secret or include it in either APK.

Student sign-in and verified registration issue a signed, 30-day bearer session. Student write operations and chat sockets require that session and derive the account identity on the server rather than trusting user IDs supplied by the client. Install the updated student APK and sign in again to establish a session; older locally saved profiles do not contain one. Public reel feeds, shared reel pages, health checks, announcements, and app-release reads remain publicly accessible. Direct unverified account registration is disabled. CORS is not used as an authentication control: native apps and scripts can call the API without browser CORS enforcement, so server-side sessions provide the access check.

The backend uses Prisma ORM and applies checked-in database migrations at each start. Set both database URLs in Render before the first deployment. New user and reel metadata, likes, comments, broadcast messages, push tokens, app releases, and account/reel deletions are stored in Supabase; new account passwords are hashed before storage. Profile images are uploaded to the private R2 bucket and served through expiring signed URLs. The old local JSON files are not automatically imported—existing local accounts/reels need a separate migration if you want to keep them. Chat matchmaking and OTPs remain in process memory.

The 100 MB limit applies to the selected source file uploaded to the server. The editor and server both restrict the published, trimmed segment to at most 40 seconds. The gallery picker may select a longer source, but only a maximum 40-second segment can be published; camera recording is limited to 40 seconds.

After the service deploys, copy its HTTPS URL (for example, `https://pmc-leela-api.onrender.com`). Set the Expo public variable `EXPO_PUBLIC_API_URL` to that URL in the EAS **preview** environment or the environment used to build the release APK:

```powershell
$env:EXPO_PUBLIC_API_URL = "https://your-render-service.onrender.com"
cd mobile
```

`EXPO_PUBLIC_API_URL` is embedded in the app at build time; it is not a secret. Rebuild the APK whenever the backend URL changes. The app uses that same URL for REST requests and Socket.IO.

### Reel sharing and Android App Links

Reel shares use clickable HTTPS links such as `https://pmcleela-api.me/reel/<reel-id>`. The backend serves a reel preview and an **Open in PMC Leela** fallback. Android opens the reel directly when App Links are verified; the app also routes notification taps and reel notifications in **Me → Notifications** straight to Leela.

The Android app claims `/reel/...` links on the hostname in `EXPO_PUBLIC_SHARE_URL` (or `EXPO_PUBLIC_API_URL` if no share URL is set); `https://pmcleela-api.me` is the fallback. For automatic app opening, configure the backend environment variable `ANDROID_APP_SHA256_CERT_FINGERPRINTS` with the SHA-256 fingerprint of the Android signing certificate used for the distributed APK (comma-separated if more than one certificate is used). The backend publishes this as `/.well-known/assetlinks.json`. Obtain the signing certificate details from EAS Android credentials; the certificate must match the APK installed on users' phones. After configuring it, deploy the backend and build/install a new student APK so the Android App Link intent filter is present.

## Build the private PMC Admin APK

The separate Expo project in `pmc-admin/` builds an internal Android APK. Its credentials are checked by the Render backend; anyone who installs the APK still needs the admin email/password. The admin token remains in memory and is discarded when the app is closed. The admin can inspect all student details and reel comments, create or delete student accounts, review reports, approve or reject account-deletion requests, and delete reels. Unresolved deletion requests are automatically processed after 24 hours. Reel deletion first removes its Cloudflare R2 object; if storage removal fails, the reel record is kept so the deletion can be retried.

1. In Render, set `PMC_ADMIN_EMAIL`, a unique `PMC_ADMIN_PASSWORD` (at least 16 characters), and a random `PMC_ADMIN_SESSION_SECRET` (at least 32 characters). Keep all three as Render environment secrets. Redeploy the backend.
2. In PowerShell, build the separate APK:

```powershell
cd A:\pmcleela\pmc-admin
npm ci
npx eas-cli build --platform android --profile preview
```

The `preview` EAS profile creates an internal APK and points it at the production Render API. Share this APK privately and do not include the credentials in the build configuration. Student reel reports are available to moderators in the admin app; each student can report a reel from its flag action.

### Broadcasts and student-app updates

- Student development/release builds ask for notification permission after sign-in and register their Expo push token with the backend. On Android, configure Firebase Cloud Messaging before expecting background system notifications: create a Firebase project, register package `com.pmcleela.app`, add its `google-services.json` as `expo.android.googleServicesFile` in `mobile/app.json`, and upload a Firebase service-account JSON for FCM V1 to the EAS credentials for this app's existing EAS project. Keep service-account credentials private and out of source control. The EAS project owner must perform this setup; a different Expo account needs access to that project. After setting credentials, build and distribute a fresh APK. Existing installs must update and sign in again to register using the authenticated push endpoint. New reel uploads and broadcasts are saved to **Me → Notifications** and sent to registered devices. In that screen, the app shows whether the current device is registered and offers retry/settings actions. Devices that deny notifications cannot receive the system push, but saved items remain available in the app.
- Android Expo Go does not support remote push notifications from SDK 53 onward. The app skips push-token registration in Expo Go to avoid its unsupported-API runtime error; the production APK and custom development builds retain push registration. Test actual phone push delivery with a development/release build, not Expo Go. Admin broadcast responses distinguish having zero registered devices from Expo accepting notification tickets; ticket acceptance alone does not prove that Android displayed a notification.
- Students who forget their password can request a one-time code at their registered `@stu.manit.ac.in` address from **Log In → Forgot password?** The code expires after 10 minutes, is limited to five attempts, and can be requested once per minute. They use it to choose a new password; the existing password is never emailed. Password reset email uses the configured Brevo sender.
- In PMC Admin, use **Notifications** to pause or resume all student push alerts and new in-app notification entries. While paused, reel uploads and app releases remain available, but no push alerts or new reel notification entries are created; broadcasts are blocked until notifications are resumed. Use **Broadcast** to send a title and message to registered devices when notifications are enabled. New reel alerts include the uploader's Leela username and caption. The Admin app reports the number of accepted push tickets; this is not a guarantee that Android displayed each notification.
- For an app release, increment `expo.android.versionCode` in `mobile/app.json`, set the corresponding `expo.version`, and build the signed student APK. In PMC Admin, open **App update**, enter the exact version name and Android version code embedded in that APK, add release notes, select the APK, and publish. The APK is stored privately in R2; publishing automatically sends an update notification and makes an update card available in Me.
- Build the student APK from the existing EAS project so it uses the existing signing credentials:

```powershell
cd A:\pmcleela\mobile
npx eas-cli build --platform android --profile preview
```

- Students tap **Download update**. Android downloads the APK and opens the system package installer; each student must approve installation. Android may also ask them to allow installs from PMC Leela. Silent installation is not supported for an ordinary sideloaded app.
- An update APK must use the same application ID (`com.pmcleela.app`) and signing key as the installed APK and have a higher Android version code. Android rejects updates signed with a different key. Preserve the same EAS Android credentials when building future APKs. Version name/code entered in Admin must match the package you built.
- This updater only reaches app builds that already include push registration and the Me update checker. Students on older builds must install an updater-enabled APK manually once before later in-app APK updates can reach them. Expo push permissions and the app-release migration take effect after the student APK and backend are rebuilt/deployed.

### Render Free limitations

Render Free instances spin down while idle and may take about a minute to wake. Video objects persist in Cloudflare R2 and user/reel metadata persists in Supabase, while chat matchmaking and OTPs are held in process memory. This deployment is suitable for a test/pilot only—not durable public use. Shared OTP/chat state, authentication hardening, and moderation are still needed before public launch. FFmpeg trimming still runs on the free web instance and can fail under its limited resources.

When moving from Backblaze B2 to R2, existing reel metadata continues to reference the same object keys. Copy existing objects to the R2 bucket with those exact keys before switching traffic if those reels must remain playable; configuring new R2 credentials does not transfer old video objects.
