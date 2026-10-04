# 🌟 पी एम सी Leela (PMC Leela)
> **The Official Campus Social App for MANIT Bhopal Students**

**पी एम सी Leela** is a mobile application built with **React Native (Expo)** and **Node.js / Socket.io**, designed around MANIT campus culture.

---

## 🏛️ Features Overview

### 1. ❤️ Piya Milan Chauraha (PMC) — 1-on-1 Ephemeral Random Chat
* **The Concept:** Named after MANIT's iconic meeting landmark—Piya Milan Chauraha. Two verified students online search and get instantly paired into a private room.
* **WhatsApp / Instagram Style Messaging:**
  * Rich text messaging with timestamps and double ticks (`✓✓`).
  * Instant photo sharing directly from phone gallery / camera.
  * Real-time typing indicators (*"Hostel 4 Maggi Chef is typing..."*).
  * Campus-themed pseudonyms (*PMC Chai Lover*, *SAC Rockstar*, *Nescafe Philosopher*, *Hostel 7 Phantom*).
* **🔥 Strict 1-Time Session (Burn Upon Exit):**
  * Once either student taps **"Agla / Next"**, **"End Chat"**, or disconnects:
  * **All messages and shared images are immediately and permanently wiped** from memory.
  * Zero logs or history are preserved.
  * Both students return to the anonymous stranger pool with new random aliases.

### 2. 🎬 Leela — Campus Video Reels
* **The Concept:** Vertical short-form campus video feed showcasing fest highlights (Maffick, Technosearch), hostel life banter, dance rehearsals, and comedy.
* **Full-Screen 9:16 Snapping Feed:**
  * Native video playback with auto-play for active reel and automatic pause for offscreen clips.
  * Mute / unmute audio toggle.
  * Animated like button (heart) with live counter.
  * Slide-up campus comments drawer to drop gossip & banter.
  * **"Post to Leela" Editor:** Trim a selected clip and choose 9:16, square, or full-frame output before publishing with a caption.
  * The server encodes and stores only the selected clip range; bundled FFmpeg is installed with the server dependencies.

### 3. 🛡️ MANIT Campus Pass & Student Verification
* Restricted access using `@manit.ac.in` domain emails to keep the community safe, genuine, and exclusive to campus students while keeping all chats anonymous.

---

## 🚀 How to Run the App

### Step 1: Start the Backend Server
Open a terminal in `a:\pmcleela\server`:
```bash
cd server
npm install
npm start
```
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
2. Scan the QR code shown in the terminal.
3. The app will load instantly on your phone with live reload!

> **Tip for Wi-Fi connection:** In the app, switch to the **MANIT Pass** tab and verify your computer's local Wi-Fi IP (e.g. `10.68.7.167`) so your phone connects directly to the backend.

## Deploy the Backend on Render Free

The repository includes a Render Blueprint at [`render.yaml`](./render.yaml). In Render, create a **Blueprint** from the GitHub repository and select the free service. The Blueprint configures:

* Root directory: `server`
* Node.js: 22 (pinned in `server/.node-version` and `server/package.json`)
* Build command: `npm ci`
* Start command: `npm start`
* Health check path: `/api/health`
* Upload limit: 100 MB; published reel length is limited to 40 seconds.
* Private Cloudflare R2 bucket; video playback uses expiring signed URLs.

If creating a Web Service manually instead, use the same root directory, commands, and health-check path. Add the following secret environment variables in Render (never commit them or add them to the APK):

* `R2_BUCKET_NAME`: the name of the Cloudflare R2 bucket for reel videos.
* `R2_ACCOUNT_ID`: your Cloudflare account ID. The S3 endpoint is constructed as `https://<account-id>.r2.cloudflarestorage.com`.
* `R2_ACCESS_KEY_ID`: the access key ID from an R2 S3 API token scoped to this bucket with object read, write, and delete permissions.
* `R2_SECRET_ACCESS_KEY`: the secret access key from the same R2 token. Keep both keys private and configure them only as Render environment variables.
* `R2_SIGNED_URL_TTL_SECONDS`: optional signed playback link lifetime; defaults to 43200 seconds.
* `MAX_APP_RELEASE_MB`: optional maximum uploaded APK size; defaults to 250 MB.
* `DATABASE_URL`: the Supabase PostgreSQL **Transaction pooler** URI (shared pooler, port `6543`) with `?pgbouncer=true&sslmode=require`. Prisma uses this IPv4-accessible URI for application queries. Replace its password placeholder with your rotated database password.
* `DIRECT_URL`: the Supabase PostgreSQL **Session pooler** URI (shared pooler, port `5432`) with `?sslmode=require`. Prisma uses this for schema migrations. Use the same rotated password and keep this server-side as a Render secret.
* `BREVO_API_KEY`: required for student OTP email. Also set `FROM_EMAIL` to the sender address verified with Brevo. OTP registration returns an error until the email API key is configured.
* `PMC_ADMIN_EMAIL`, `PMC_ADMIN_PASSWORD`, `PMC_ADMIN_SESSION_SECRET`: configure the dedicated admin login only in Render. Use a unique password of at least 16 characters and a randomly generated session secret of at least 32 characters. Never put these values in the admin APK or repository.

The backend uses Prisma ORM and applies checked-in database migrations at each start. Set both database URLs in Render before the first deployment. New user and reel metadata, likes, comments, broadcast messages, push tokens, app releases, and account/reel deletions are stored in Supabase; new account passwords are hashed before storage. The old local JSON files are not automatically imported—existing local accounts/reels need a separate migration if you want to keep them. Chat matchmaking and OTPs remain in process memory.

The 100 MB limit applies to the selected source file uploaded to the server. The editor and server both restrict the published, trimmed segment to at most 40 seconds. The gallery picker may select a longer source, but only a maximum 40-second segment can be published; camera recording is limited to 40 seconds.

After the service deploys, copy its HTTPS URL (for example, `https://pmc-leela-api.onrender.com`). Set the Expo public variable `EXPO_PUBLIC_API_URL` to that URL in the environment used to build the release APK (or in your Expo/EAS build environment):

```powershell
$env:EXPO_PUBLIC_API_URL = "https://your-render-service.onrender.com"
cd mobile
```

`EXPO_PUBLIC_API_URL` is embedded in the app at build time; it is not a secret. Rebuild the APK whenever the backend URL changes. The app uses that same URL for REST requests and Socket.IO.

## Build the private PMC Admin APK

The separate Expo project in `pmc-admin/` builds an internal Android APK. Its credentials are checked by the Render backend; anyone who installs the APK still needs the admin email/password. The admin token remains in memory and is discarded when the app is closed. The admin can inspect all student details and reel comments, create or delete student accounts, review reports, and delete reels. Reel deletion first removes its Cloudflare R2 object; if storage removal fails, the reel record is kept so the deletion can be retried.

1. In Render, set `PMC_ADMIN_EMAIL`, a unique `PMC_ADMIN_PASSWORD` (at least 16 characters), and a random `PMC_ADMIN_SESSION_SECRET` (at least 32 characters). Keep all three as Render environment secrets. Redeploy the backend.
2. In PowerShell, build the separate APK:

```powershell
cd A:\pmcleela\pmc-admin
npm ci
npx eas-cli build --platform android --profile preview
```

The `preview` EAS profile creates an internal APK and points it at the production Render API. Share this APK privately and do not include the credentials in the build configuration. Student reel reports are available to moderators in the admin app; each student can report a reel from its flag action.

### Broadcasts and student-app updates

- Student builds ask for notification permission after sign-in and register their Expo push token with the backend. Expo push delivery on Android requires valid Firebase Cloud Messaging v1 credentials configured for the EAS project. Devices that deny notifications cannot receive the system push, but broadcast messages remain visible in the student app's **Me → Updates & announcements** section.
- In PMC Admin, use **Broadcast** to send a title and message to registered devices. The Admin app reports the number of accepted push tickets; this is not a guarantee that Android displayed each notification.
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
