<div align="center">

<img src="https://img.shields.io/badge/FlowTask-AI%20Kanban-6333ff?style=for-the-badge&logo=lightning&logoColor=white" alt="FlowTask" />

# ⚡ FlowTask

### AI-Powered Kanban Productivity App

**Describe a task in plain English. AI classifies it. It syncs everywhere.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?style=flat-square&logo=vercel)](https://flowtask.vercel.app)
[![Firebase](https://img.shields.io/badge/Firebase-v8-orange?style=flat-square&logo=firebase)](https://firebase.google.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/premsahni23/flowtask/pulls)

<br/>

![FlowTask Screenshot](https://raw.githubusercontent.com/premsahni23/flowtask/main/.github/preview.png)

</div>

---

## ✨ What is FlowTask?

FlowTask is a **production-ready SaaS Kanban board** that uses AI to automatically classify your tasks into the right column the moment you type them. No manual sorting. No friction. Just describe what you're working on and let the AI figure out where it belongs.

Built with a premium dark glassmorphism UI, real-time multi-device sync via Firebase, and a serverless AI backend — it feels like a real startup product.

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🤖 **AI Task Classification** | Describe a task in natural language — AI auto-sorts it into To Do, In Progress, or Completed |
| 🔐 **Google Authentication** | One-click sign-in with Google. Sessions persist across page reloads |
| ☁️ **Real-Time Sync** | Tasks sync instantly across all your devices via Firestore `onSnapshot` |
| 🎙 **Voice Input** | Click the mic and speak your task — Web Speech API fills the input |
| 📊 **AI Insights Panel** | Live stats: tasks done, pending, in progress + a smart motivational message |
| 🖱 **Drag & Drop** | Move tasks between columns with smooth drag-and-drop |
| 📱 **PWA Support** | Install as a native app on mobile and desktop |
| 🌙 **Premium Dark UI** | Glassmorphism design with animated gradients and micro-interactions |
| 🔒 **Per-User Data** | Every user's tasks are private and isolated by Firestore security rules |

---

## 🖼 Preview

<div align="center">

| Login Screen | Kanban Board | AI Insights |
|:---:|:---:|:---:|
| Google Sign-In overlay | 3-column drag & drop | Live stats panel |

</div>

---

## 🛠 Tech Stack

```
Frontend      →  Vanilla HTML + CSS + JavaScript (no framework)
UI Style      →  Glassmorphism dark theme, custom animations
Auth          →  Firebase Authentication (Google Sign-In)
Database      →  Cloud Firestore (real-time onSnapshot)
AI Backend    →  Anthropic Claude via Vercel Serverless Function
Voice         →  Web Speech API (browser-native)
PWA           →  manifest.json + Service Worker
Deployment    →  Vercel
Firebase SDK  →  v8 CDN (compat mode)
```

---

## 📁 Project Structure

```
flowtask/
├── index.html          # Main app — all UI, auth, Firestore logic
├── api/
│   └── classify.js     # Serverless function — AI task classification
├── sw.js               # Service worker — PWA offline support
├── manifest.json       # PWA manifest — installable app config
├── vercel.json         # Vercel deployment config
├── package.json        # Project metadata + scripts
├── .env.example        # Environment variable template
└── icons/
    ├── icon-192.png    # PWA icon (192×192)
    └── icon-512.png    # PWA icon (512×512)
```

---

## ⚙️ Setup & Deployment

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [Vercel CLI](https://vercel.com/cli) — `npm i -g vercel`
- A [Firebase](https://console.firebase.google.com) project
- An [Anthropic](https://console.anthropic.com) API key

---

### Step 1 — Clone the repo

```bash
git clone https://github.com/premsahni23/flowtask.git
cd flowtask
```

---

### Step 2 — Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) → your project → **Project Settings** → **Your apps**
2. Copy your web app config
3. Open `index.html` and replace the `firebaseConfig` object:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

4. **Enable Google Sign-In**
   - Firebase Console → Authentication → Sign-in method → **Google** → Enable → Save

5. **Create Firestore Database**
   - Firebase Console → Firestore Database → **Create database** → Production mode → Choose region

6. **Set Firestore Security Rules**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tasks/{taskId} {
      allow read, update, delete: if request.auth != null
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

7. **Create Composite Index**
   - Firestore → Indexes → Composite → Add index
   - Collection: `tasks` | Fields: `userId ASC` + `createdAt ASC`

   > 💡 Alternatively, just open the app and click the auto-generated index link in the browser console.

---

### Step 3 — Set up environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

---

### Step 4 — Deploy to Vercel

```bash
npm install
vercel
```

Follow the prompts. When asked about environment variables, add `ANTHROPIC_API_KEY`.

For production:
```bash
vercel --prod
```

> **Add your Vercel domain to Firebase Authorized Domains:**
> Firebase Console → Authentication → Settings → Authorized domains → Add domain

---

### Local Development

```bash
vercel dev
```

Open `http://localhost:3000` — Google Sign-In requires a real domain (not `file://`).

---

## 🗄 Firestore Data Schema

```
Collection: tasks
└── Document (auto-ID)
    ├── userId:    string   — Firebase Auth UID
    ├── text:      string   — Task description
    ├── col:       string   — "todo" | "inprogress" | "completed"
    └── createdAt: timestamp — Server timestamp
```

---

## 🤖 AI Classification API

**Endpoint:** `POST /api/classify`

**Request:**
```json
{ "text": "Working on the Q4 report" }
```

**Response:**
```json
{
  "category": "inprogress",
  "title": "Working on Q4 report"
}
```

The serverless function calls **Anthropic Claude** to classify the task and clean up the title. If the API call fails, the task falls back to the `todo` column — the app never breaks.

---

## 🔒 Security

- API keys are **never exposed** in the frontend — all AI calls go through a serverless function
- Firestore rules ensure users can **only read/write their own tasks**
- User input is **HTML-escaped** before rendering to prevent XSS
- Firebase Auth handles session management and token refresh automatically

---

## 📱 PWA Installation

FlowTask is installable as a native app:

- **Chrome/Edge (Desktop):** Click the install icon in the address bar
- **Android:** Browser menu → "Add to Home Screen"
- **iOS Safari:** Share → "Add to Home Screen"

---

## 🤝 Contributing

Contributions are welcome! Here's how:

```bash
# Fork the repo, then:
git checkout -b feature/your-feature-name
git commit -m "feat: add your feature"
git push origin feature/your-feature-name
# Open a Pull Request
```

---

## 📄 License

MIT © [Prem Sahni](https://github.com/premsahni23)

---

<div align="center">

Built with ⚡ by [Prem Sahni](https://github.com/premsahni23)

**[⭐ Star this repo](https://github.com/premsahni23/flowtask)** if you found it useful!

</div>
