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
* Upload limit: 100 MB; published reel length is limited to 20 seconds.
* Private Backblaze B2 bucket `pmcleela` in region `us-east-005`; video playback uses expiring signed URLs.

If creating a Web Service manually instead, use the same root directory, commands, and health-check path. Add the following secret environment variables in Render (never commit them or add them to the APK):

* `B2_KEY_ID`: the key ID from a Backblaze application key restricted to this bucket with read, write, and delete access.
* `B2_APPLICATION_KEY`: the secret application key value; do not use a master key.
* `DATABASE_URL`: the Supabase PostgreSQL **Transaction pooler** URI (shared pooler, port `6543`) with `?pgbouncer=true&sslmode=require`. Prisma uses this IPv4-accessible URI for application queries. Replace its password placeholder with your rotated database password.
* `DIRECT_URL`: the Supabase PostgreSQL **Session pooler** URI (shared pooler, port `5432`) with `?sslmode=require`. Prisma uses this for schema migrations. Use the same rotated password and keep this server-side as a Render secret.
* `BREVO_API_KEY`: required for student OTP email. Also set `FROM_EMAIL` to the sender address verified with Brevo. OTP registration returns an error until the email API key is configured.

The backend uses Prisma ORM and applies checked-in database migrations at each start. Set both database URLs in Render before the first deployment. New user and reel metadata, likes, comments, and account/reel deletions are stored in Supabase; new account passwords are hashed before storage. The old local JSON files are not automatically imported—existing local accounts/reels need a separate migration if you want to keep them. Chat matchmaking and OTPs remain in process memory.

The 100 MB limit applies to the selected source file uploaded to the server. The editor and server both restrict the published, trimmed segment to at most 20 seconds. The gallery picker may select a longer source, but only a maximum 20-second segment can be published; camera recording is limited to 20 seconds.

After the service deploys, copy its HTTPS URL (for example, `https://pmc-leela-api.onrender.com`). Set the Expo public variable `EXPO_PUBLIC_API_URL` to that URL in the environment used to build the release APK (or in your Expo/EAS build environment):

```powershell
$env:EXPO_PUBLIC_API_URL = "https://your-render-service.onrender.com"
cd mobile
```

`EXPO_PUBLIC_API_URL` is embedded in the app at build time; it is not a secret. Rebuild the APK whenever the backend URL changes. The app uses that same URL for REST requests and Socket.IO.

### Render Free limitations

Render Free instances spin down while idle and may take about a minute to wake. Video objects persist in Backblaze B2 and user/reel metadata persists in Supabase, while chat matchmaking and OTPs are held in process memory. This deployment is suitable for a test/pilot only—not durable public use. Shared OTP/chat state, authentication hardening, and moderation are still needed before public launch. FFmpeg trimming still runs on the free web instance and can fail under its limited resources.
