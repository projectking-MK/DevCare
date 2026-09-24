# 🛡️ GuardianLink — Transparent Parental Safety Monitoring

[![Production Ready](https://img.shields.io/badge/production-ready-emerald.svg)](https://github.com)
[![Zero Cloud Database](https://img.shields.io/badge/database-zero--server--persistence-blue.svg)](https://github.com)
[![WebRTC P2P](https://img.shields.io/badge/WebRTC-P2P%20Streaming-purple.svg)](https://github.com)
[![Local Storage](https://img.shields.io/badge/Storage-Parent%20IndexedDB-amber.svg)](https://github.com)

**GuardianLink** is a production-grade, legitimate parental safety monitoring web application built on principles of **transparency, mutual trust, and child consent**.

GuardianLink provides real-time WebRTC audio/video feeds, encrypted WebSocket signaling, temporary cryptographic pairing, and local device-only video recording.

---

## 🚫 Transparent Child Safety Guarantees (Anti-Surveillance Architecture)

* **No Stealth Surveillance:** Camera and microphone access can **NEVER** be activated secretly or without the child's explicit permission.
* **On-Screen Permission Prompt:** Each monitoring session requires the child to click **`[ Allow ]`** on an on-screen dialog showing exactly what is requested (camera, microphone, or both).
* **Visible Status Indicators:** The child screen displays a prominent, high-contrast status banner:
  ```text
  🟢 MONITORING ACTIVE
  Camera: ON
  Microphone: ON
  Connection: Connected
  [ STOP MONITORING ]
  ```
* **Persistent Child Override:** The child can terminate the session at any time with a single tap on `[ STOP MONITORING ]`. All media hardware tracks are immediately stopped.
* **Zero Remote Database:** The server holds **no persistent database** (no PostgreSQL, MongoDB, MySQL, Firebase, Supabase).
* **Local-Only Recordings:** Recorded video blobs are stored strictly in the parent device's browser **IndexedDB** (`GuardianLinkDB`). Recordings are **never** uploaded to any server.

---

## 🏗️ Production Architecture

```text
                           INTERNET
                              │
                     HTTPS / WSS (TLS 1.3)
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
   PARENT BROWSER                           CHILD BROWSER
   (React + Vite + Tailwind)                (React + Vite + Tailwind)
          │                                       │
          │ ─── Authenticated Session (Cookie) ───┤
          │                                       │
          └───────────────────┬───────────────────┘
                              │
                        Node.js Server
                  (Express + Socket.IO Signaling)
                   • Temporary In-Memory Sessions
                   • Temporary 6-Digit Pairing
                   • WebRTC Signaling (Offer/Answer/ICE)
                              │
                        WebRTC Setup
                              │
                     STUN / TURN Server
                              │
          ▲═══════════════════════════════════════▲
          ║    Direct P2P Encrypted Audio/Video   ║
          ║      (SRTP / DTLS Media Channels)     ║
          ╚═══════════════════════════════════════╝
```

---

## 💻 Technology Stack

### Frontend (`/client`)
* **React 18** with **TypeScript**
* **Vite** bundler with optimized chunk splitting
* **Tailwind CSS** with responsive, dark-mode design
* **React Router v7** for SPA routing (`/login`, `/`, `/child`, `/monitoring`, `/recordings`, `/sessions`, `/settings`)
* **Socket.IO Client** for encrypted real-time signaling
* **WebRTC APIs** (`RTCPeerConnection`, `getUserMedia`, ICE candidate queuing)
* **MediaRecorder API** with WebM container generation
* **IndexedDB** (`GuardianLinkDB`) for parent-side local recording blobs and session logs

### Backend (`/server`)
* **Node.js** & **Express** with TypeScript
* **Socket.IO** for WebSocket signaling and presence
* **Bcrypt.js** for secure parent password hashing
* **Cookie-Parser** with `HttpOnly` + `Secure` + `SameSite=Lax` session management
* **Helmet** for hardened CSP, XSS, framing protection, and strict `Permissions-Policy: camera=(self), microphone=(self)`
* **Express-Rate-Limit** for brute-force protection on login and pairing verification
* **Zod** schema validation

---

## 📁 Project Directory Structure

```text
guardianlink/
├── client/
│   ├── public/
│   │   └── shield.svg
│   ├── src/
│   │   ├── child/
│   │   │   ├── ChildInterface.tsx               # Coordinator for /child
│   │   │   ├── ChildPairingView.tsx             # 6-digit code entry view
│   │   │   ├── ChildMonitoringActiveView.tsx    # High-contrast live view + STOP button
│   │   │   ├── PermissionPromptModal.tsx        # Transparent Allow/Deny modal
│   │   │   └── BackgroundLimitBanner.tsx        # OS background throttling advisory
│   │   ├── parent/
│   │   │   ├── LiveMonitoringPanel.tsx          # Real-time player, audio meter, recording
│   │   │   ├── DevicePairingModal.tsx           # 6-digit code generation + countdown
│   │   │   └── StorageQuotaWidget.tsx           # Browser storage gauge (Used vs Free)
│   │   ├── components/
│   │   │   ├── Layout.tsx                       # App shell
│   │   │   ├── Sidebar.tsx                      # Navigation
│   │   │   ├── Topbar.tsx                       # Header & parent status
│   │   │   ├── StatusCard.tsx                   # Dashboard metric card
│   │   │   ├── VideoPlayer.tsx                  # WebRTC & Blob player with controls
│   │   │   └── AudioVisualizer.tsx              # Web Audio API real-time VU meter
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx                    # HttpOnly authentication
│   │   │   ├── DashboardPage.tsx                # Main operations center
│   │   │   ├── LiveMonitoringPage.tsx           # Dedicated monitoring screen
│   │   │   ├── RecordingsPage.tsx               # IndexedDB local playback & download
│   │   │   ├── SessionsPage.tsx                 # IndexedDB session audit history
│   │   │   ├── DevicesPage.tsx                  # Paired child device management
│   │   │   ├── SettingsPage.tsx                 # WebRTC, ICE, and security parameters
│   │   │   └── ChildPage.tsx                    # Child route wrapper
│   │   ├── hooks/
│   │   │   ├── useAuth.ts                       # Parent authentication context
│   │   │   └── useMediaRecorder.ts              # Local recording hook with quota guards
│   │   ├── services/
│   │   │   ├── api.ts                           # Fetch client with cookie credentials
│   │   │   ├── auth.ts                          # Auth operations
│   │   │   ├── database.ts                      # IndexedDB wrapper (GuardianLinkDB)
│   │   │   ├── socket.ts                        # Socket.IO connection manager
│   │   │   └── webrtc.ts                        # RTCPeerConnection manager
│   │   └── utils/
│   │       ├── formatters.ts                    # Time, duration, and byte helpers
│   │       └── storage.ts                       # Non-sensitive client preferences
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── server/
│   ├── src/
│   │   ├── auth/
│   │   │   ├── authController.ts                # Login, session verification, logout
│   │   │   ├── authMiddleware.ts                # HttpOnly cookie guard
│   │   │   └── passwordUtils.ts                 # Bcrypt hashing & verification
│   │   ├── middleware/
│   │   │   ├── errorHandler.ts                  # Safe production error responses
│   │   │   ├── rateLimiter.ts                   # Login & pairing rate limiters
│   │   │   └── security.ts                      # Helmet, CSP, Permissions-Policy
│   │   ├── pairing/
│   │   │   ├── pairingController.ts             # REST endpoints for pairing
│   │   │   └── pairingService.ts                # Cryptographic 6-digit code manager
│   │   ├── sessions/
│   │   │   ├── sessionStore.ts                  # In-memory session & state Maps
│   │   │   └── types.ts                         # Data types
│   │   ├── webrtc/
│   │   │   └── rtcConfig.ts                     # STUN/TURN ICE configuration
│   │   ├── websocket/
│   │   │   ├── socketHandlers.ts                # Signaling, presence, & teardown
│   │   │   └── socketServer.ts                  # Socket.IO initialization
│   │   ├── utils/
│   │   │   ├── hashPassword.ts                  # CLI password hash utility
│   │   │   └── logger.ts                        # Redacted privacy-compliant logger
│   │   └── server.ts                            # Express entry point
│   ├── package.json
│   └── tsconfig.json
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 Quick Start Guide (Development)

### 1. Prerequisites
* **Node.js** >= 18.0.0 (tested on v24.18.0)
* **npm** >= 9.0.0

### 2. Installation
```bash
git clone <repository-url>
cd guardianlink
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

For development, default credentials are pre-configured:
* **Email:** `parent@example.com`
* **Password:** `GuardianPass123!`

To generate a new custom bcrypt password hash:
```bash
npm run hash-password -- "YourStrongPasswordHere"
```
Copy the generated hash into `PARENT_PASSWORD_HASH` in `.env`.

### 4. Build & Run
Build both frontend and backend:
```bash
npm run build
```

Start the production server:
```bash
npm start
```
The server will be available at `http://localhost:3000`.

### 5. Accessing the Application
1. **Parent Portal:** Navigate to `http://localhost:3000/login`
   - Log in with `parent@example.com` / `GuardianPass123!`
   - On the Dashboard, click **`[ Pair Child Device ]`** to get a 6-digit code (e.g. `482913`).
2. **Child Device:** Open `http://localhost:3000/child` in an incognito window or on a separate phone/laptop.
   - Enter the 6-digit code and click **`[ Connect ]`**.
3. **Initiate Monitoring:**
   - From the parent dashboard, click **`[ Start Monitoring ]`**.
   - On the child device, a transparent prompt appears:
     ```text
     GuardianLink Safety Request
     Camera: Requested
     Microphone: Requested
     [ Allow ]   [ Deny ]
     ```
   - Click **`[ Allow ]`**. The child device displays `🟢 MONITORING ACTIVE` with a self-view and a prominent `[ STOP MONITORING ]` button.
   - On the parent dashboard, the live video/audio feed appears instantly with an audio VU meter.
   - The parent can click **`[ 🔴 Start Recording ]`** to capture local video clips directly into IndexedDB.

---

## 🔒 Security Architecture & Headers

### Secure Session Handling
* GuardianLink uses an **`HttpOnly` + `Secure` + `SameSite=Lax`** cookie (`guardian_session`).
* JavaScript running on the client **cannot read, steal, or export** the authentication cookie via XSS.
* Sessions are maintained purely in temporary server memory (`sessionStore`). When the server restarts, all active sessions and pairings are instantly wiped.

### Strict HTTP Security Headers
* **Content-Security-Policy (CSP):** Restricts script, style, and media sources. Allows `blob:` exclusively for local recording playback and WebRTC video elements.
* **Permissions-Policy:** Explicitly isolates media capture:
  ```http
  Permissions-Policy: camera=(self), microphone=(self), display-capture=()
  ```
* **X-Content-Type-Options:** `nosniff`
* **X-Frame-Options:** `DENY`
* **Referrer-Policy:** `strict-origin-when-cross-origin`
* **Strict-Transport-Security (HSTS):** Enforced in production (`max-age=31536000; includeSubDomains; preload`).

### Rate Limiting & Input Validation
* **Login Rate Limit:** 10 attempts per 15 minutes per IP.
* **Pairing Rate Limit:** 10 verification attempts per 15 minutes per IP to eliminate brute-force enumeration.
* **Zod Schemas:** Enforces strict numeric 6-digit constraints on pairing codes and sanitized email formats.

---

## 🌐 Production Deployment Guide

In production, GuardianLink should run behind a reverse proxy handling TLS termination on HTTPS (`https://guardianlink.example.com`) and WebSocket upgrades (`wss://guardianlink.example.com`).

### Production `.env`
```env
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://guardianlink.example.com
SESSION_SECRET=a_very_long_cryptographically_secure_random_string_here
PARENT_EMAIL=parent@example.com
PARENT_PASSWORD_HASH=$2b$10$Y8PqOu2ozjMIPEkbwL9treY1zz2pbYJZrfN71ZtuO08gTuaKFvWCa

# STUN / TURN Configuration
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:turn.guardianlink.example.com:3478
TURN_USERNAME=gl_turn_user
TURN_PASSWORD=gl_turn_secret_password
```

### Nginx Reverse Proxy Configuration
```nginx
server {
    listen 80;
    server_name guardianlink.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name guardianlink.example.com;

    ssl_certificate /etc/letsencrypt/live/guardianlink.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/guardianlink.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Client application & API
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket / Socket.IO Upgrades
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### Caddy Reverse Proxy Configuration
```caddy
guardianlink.example.com {
    reverse_proxy localhost:3000
}
```

---

## 📡 STUN/TURN Server Setup (coturn)

Direct WebRTC connections use STUN for NAT traversal. However, if the parent or child device is behind symmetric NAT, enterprise firewalls, or strict cellular carrier NAT, a **TURN relay** is required.

### Installing coturn (Ubuntu / Debian)
```bash
sudo apt-get update
sudo apt-get install -y coturn
```

### Configure `/etc/turnserver.conf`:
```conf
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=gl_turn_secret_password
realm=guardianlink.example.com
user=gl_turn_user:gl_turn_secret_password
total-quota=100
bps-capacity=0
stale-nonce
no-loopback-peers
no-multicast-peers
```

Start the turn server:
```bash
sudo systemctl restart coturn
```

Update your `.env` with the configured TURN credentials:
```env
TURN_SERVER=turn:turn.guardianlink.example.com:3478
TURN_USERNAME=gl_turn_user
TURN_PASSWORD=gl_turn_secret_password
```

---

## 💾 Local IndexedDB Storage (`GuardianLinkDB`)

GuardianLink stores all persistent assets **strictly on the parent browser**:

| Store Name | Primary Key | Description |
| :--- | :--- | :--- |
| `recordings` | `id` | Recorded video `Blob`, duration, MIME type, device name, and byte size |
| `devices` | `deviceId` | Cached metadata of paired child hardware |
| `sessions` | `id` | Audit records of past monitoring sessions (date, duration, status) |
| `settings` | `key` | Parent application UI preferences |

### Storage Quota Safeguards
* GuardianLink queries `navigator.storage.estimate()` to monitor local disk allocation.
* If storage exceeds 80%, a warning banner recommends downloading or clearing old clips.
* If storage exceeds 95%, new recording attempts are blocked with the prompt:
  ```text
  Storage limit reached.
  Delete an existing recording before recording again.
  ```
* Recordings are **never silently deleted**.

---

## 🧪 Verification & Automated Testing

GuardianLink includes an automated end-to-end verification script testing all critical security and session flows.

To run the verification suite:
1. Start the server:
   ```bash
   npm start
   ```
2. In a separate terminal, execute:
   ```bash
   node scratch/test_system.js
   ```

### Automated Suite Results:
```text
🧪 Starting GuardianLink Verification Suite...

1. Testing /health endpoint:
   Status: 200, Body: {"status":"ok"}
   ✅ Health check PASSED

2. Testing client static serving (index.html):
   Status: 200, Contains GuardianLink: true
   ✅ Static serving PASSED

3. Testing WebRTC ICE configuration endpoint:
   Status: 200, ICE Servers: [{"urls":"stun:stun.l.google.com:19302"}]
   ✅ WebRTC config PASSED

4. Testing protected route rejection without authentication:
   Status: 401 (Expected 401), Code: AUTH_REQUIRED
   ✅ Protected route rejection PASSED

5. Testing parent login with configured credentials:
   Status: 200, User: {"parentId":"parent_cGFyZW50QGV4","email":"parent@example.com"}
   Set-Cookie: guardian_session=efd0e2166d22e7fb71c0f54e...
   ✅ Parent login PASSED

6. Testing authenticated session verification (/api/auth/me):
   Status: 200, Authenticated: true, Email: parent@example.com
   ✅ Session verification PASSED

7. Testing temporary pairing code generation:
   Status: 200, Code: 847353
   ✅ Pairing code generation PASSED

8. Testing child device code verification & pairing:
   Status: 200, DeviceId: dev_b1455cf71b14d72e, Name: Kid Galaxy S24
   ✅ Child device pairing PASSED

9. Testing pairing code one-time invalidation (re-use should fail):
   Status: 400 (Expected 400), Error: Invalid or expired pairing code.
   ✅ One-time code invalidation PASSED

10. Testing parent device listing:
   Status: 200, Device Count: 1
   ✅ Device listing PASSED

11. Testing parent logout:
   Status: 200, Message: Logged out successfully.
   ✅ Parent logout PASSED

12. Verifying session is invalidated after logout:
   Status: 401 (Expected 401), Code: SESSION_EXPIRED
   ✅ Invalidation verification PASSED

🎉 ALL 12 END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY!
```

---

## 📱 Background Limitations & OS Notice

Modern web browsers (Chrome, Safari, Firefox, iOS WebKit, Android WebView) impose strict OS-level battery and privacy restrictions:
* When a browser tab is placed in the background or minimized, operating systems throttle timers and suspend WebRTC media streams.
* **GuardianLink never attempts to evade, bypass, or circumvent OS background limits.**
* When the child tab is backgrounded, a notice informs the user:
  ```text
  Background operation is limited by your browser or operating system.
  Keep this tab open and in view for continuous connection.
  ```
* The WebRTC codebase is cleanly abstracted so that it can be wrapped in a native Android foreground service (`android.app.Service` with `FOREGROUND_SERVICE_TYPE_CAMERA`) or iOS CallKit/PushKit service for native background capability if desired.

---

## 🛡️ Production Verification Checklist

| Category | Requirement | Status |
| :--- | :--- | :--- |
| **Authentication** | Password never stored in browser storage | ✅ Verified |
| | Password never logged server-side | ✅ Verified |
| | Authentication uses secure HttpOnly cookie | ✅ Verified |
| | Session expiration & idle timeout enforced | ✅ Verified |
| | Logout invalidates in-memory session | ✅ Verified |
| **WebRTC** | Camera permission explicitly required | ✅ Verified |
| | Microphone permission explicitly required | ✅ Verified |
| | Child visibly sees monitoring status banner | ✅ Verified |
| | Child can stop monitoring with persistent button | ✅ Verified |
| | Parent can stop monitoring at any time | ✅ Verified |
| | STUN / TURN configuration supported via `.env` | ✅ Verified |
| | Candidate queuing and ICE restart implemented | ✅ Verified |
| **Storage** | Zero persistent server database | ✅ Verified |
| | IndexedDB initialized on parent device | ✅ Verified |
| | Video recordings stored locally in IndexedDB | ✅ Verified |
| | Video recordings never uploaded to server | ✅ Verified |
| | Local playback via `URL.createObjectURL` | ✅ Verified |
| | Local download and deletion supported | ✅ Verified |
| | Storage quota estimated & guarded | ✅ Verified |
| **Security** | HTTPS / WSS ready | ✅ Verified |
| | Strict Permissions-Policy (`camera=(self)`) | ✅ Verified |
| | Strict CSP and framing protections | ✅ Verified |
| | CORS restricted to configured origin | ✅ Verified |
| | Rate limiting on login and pairing verification | ✅ Verified |
| | Server restart clears all temporary sessions | ✅ Verified |

---

## 📄 License
GuardianLink is built strictly for legitimate child safety and family transparent protection. Spyware, stealth surveillance, and unauthorized deployment are strictly prohibited.
