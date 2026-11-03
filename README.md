# Mansour AI Living Wall

A production-structured festival activation with four independently deployable applications:

- `apps/visitor` — mobile-first bilingual visitor journey (Vite, React, i18next)
- `apps/display` — resolution-independent 360° LED wall canvas (Vite, React, Framer Motion)
- `apps/admin` — authenticated operations, moderation, analytics, exports, and display controls
- `apps/api` — Express, MongoDB/Mongoose, Socket.IO, OpenAI generation and moderation
- `packages/shared` — characters, prompts, DTOs, and display defaults
- `packages/ui` — small reusable UI primitives

## Prerequisites

- Node.js 20+
- MongoDB 7+ (local, Atlas, or a managed compatible cluster)
- An OpenAI API key for AI rewriting and cloud moderation. Without it, visitors can still submit their own message; local safety checks run and uncertain content is held for review.

## Installation

```bash
npm install
copy .env.example .env
npm run seed
```

Set `MONGODB_URI`, a long random `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `IP_HASH_SALT`, and optionally `OPENAI_API_KEY` in `.env`. Frontend builds use `VITE_API_URL` and `VITE_SOCKET_URL`; place these values in an `.env` file inside each frontend app for non-default hosts.

## Run locally

Run everything together:

```bash
npm run dev
```

Or run each service independently:

```bash
npm run dev -w @mansour/api       # http://localhost:4000
npm run dev -w @mansour/visitor   # http://localhost:5173 (QR target: /join)
npm run dev -w @mansour/display   # http://localhost:5174
npm run dev -w @mansour/admin     # http://localhost:5175
```

Health check: `GET http://localhost:4000/health`.

## Character artwork

Supply transparent PNG artwork with generous safe space around each character. Add identical copies to the `public/characters` directory in visitor, display, and admin (or serve a shared CDN path):

```text
mansour.png
obaid.png
salem.png
turki.png
shamma.png
nano.png
grandpa-saqar.png
sara.png
```

The apps intentionally show branded color/initial fallbacks until licensed final artwork is supplied. Character metadata lives only in `packages/shared/src/index.ts`.

## LED setup

The display reads `window.innerWidth` and `window.innerHeight`; no 16:9 assumption is made. Configure the LED processor as one contiguous desktop/canvas, set the browser window to the exact processor output resolution (for example 7680×1080), open the display URL, enable kiosk/full-screen mode, hide the cursor, and disable OS scaling, sleep, notifications, and screen savers. Chrome kiosk example:

```bash
chrome --kiosk --app=http://localhost:5174 --window-position=0,0 --window-size=7680,1080
```

Calibrate the processor seam/rotation in the processor software. The canvas edge shading gives an operator a subtle seam reference and can be removed in `apps/display/src/styles.css` after calibration. The placement engine distributes notes across the measured canvas, avoids the center hero safe area, scores overlaps, and progressively reduces older notes to a memory layer.

## Demo mode

Sign into Admin, open **Display Control**, and select **Start Demo**. The API generates an approved Arabic or English message every 2–5 seconds and broadcasts it through the real Socket.IO path. **Stop Demo** halts generation; **Clear Demo Data** removes records marked `isDemo: true`.

## Moderation and resilience

Submissions are saved as `pending` before moderation. Deterministic checks block contact details, URLs, profanity, spam, and promotions; OpenAI moderation adds semantic safety classification. Safe messages become `approved` and emit `sticky:new`; uncertainty becomes `review`; unsafe messages become `rejected`. Admin actions can approve, edit, reject, remove, or feature messages.

The display retains existing notes through a connection loss. On reconnect it requests `GET /api/display/sync?after=<timestamp>` and applies missed approvals. Indexes support status/time, character, language, session, and sticky-number access. API responses are compressed and protected with Helmet, constrained CORS, rate limiting, input validation, Mongo sanitization, body limits, hashed IP storage, and expiring admin JWTs.

## Production build and deployment

```bash
npm run build
npm run start -w @mansour/api
```

Deploy each frontend's `dist` directory independently to a static/CDN host. Deploy `apps/api/dist` to a persistent Node.js service that supports WebSockets. Use a multi-node Socket.IO adapter (Redis is recommended) when horizontally scaling the API; enable sticky load-balancer sessions. Use MongoDB Atlas with indexes and connection pooling. Terminate TLS at the load balancer and set all public endpoints to HTTPS/WSS.

For the on-site display, prefer a wired LAN and local edge API relay. Keep cloud connectivity as a fallback. Point `VITE_API_URL` and `VITE_SOCKET_URL` at the production API before building each frontend. Keep secrets only in the API runtime environment—never in any `VITE_` variable.

## Data and reporting

Admin export endpoints provide submissions, character statistics, and hourly/analytics CSV files with UTF-8 BOM for Arabic compatibility. The analytics service records QR scans, sessions, character choices, AI generations/regenerations, submissions, approvals, and rejections. Server-side calculations return 15-, 30-, and 60-minute peak windows.
