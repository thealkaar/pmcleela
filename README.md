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
* Build command: `npm ci`
* Start command: `npm start`
* Health check path: `/api/health`
* Upload limit: 90 MB

If creating a Web Service manually instead, use the same root directory, commands, and health-check path. Set `BREVO_API_KEY` in the Render service's environment settings and set `FROM_EMAIL` to the sender address verified with Brevo. OTP registration will return an error in production until the email API key is configured.

After the service deploys, copy its HTTPS URL (for example, `https://pmc-leela-api.onrender.com`). Set the Expo public variable `EXPO_PUBLIC_API_URL` to that URL in the environment used to build the release APK (or in your Expo/EAS build environment):

```powershell
$env:EXPO_PUBLIC_API_URL = "https://your-render-service.onrender.com"
cd mobile
```

`EXPO_PUBLIC_API_URL` is embedded in the app at build time; it is not a secret. Rebuild the APK whenever the backend URL changes. The app uses that same URL for REST requests and Socket.IO.

### Render Free limitations

Render Free instances spin down while idle and may take about a minute to wake. Their filesystem is ephemeral, so this backend's current JSON user/reel data and locally uploaded videos can be lost when the service restarts, spins down, or deploys. Chat matchmaking and OTPs are also held in process memory. This deployment is suitable for a test/pilot only—not durable public use. Before inviting users to rely on it, move user/reel records to Supabase/Postgres, video objects to Backblaze B2, and shared OTP/chat state to durable/shared services. FFmpeg trimming also runs on the free web instance and can fail under its limited resources.
