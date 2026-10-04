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
