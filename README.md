# ukn — universal visual AI agent (v0)

A chat interface where you type a natural-language request and an AI agent
drives a real cloud browser to fulfill it — returning either a **screenshot**
or a **screen-recorded video clip** instead of just text.

Example prompts:
- "Go to YouTube, search lofi hip hop radio, and record the first 15 seconds"
- "Go to Amazon and show me a screenshot of the product page for [item]"

## How it works

1. **Groq** (`agent.js`) turns your prompt into a small JSON plan: a goal,
   an output type (`screenshot` or `video`), and a list of browser steps
   (goto / click / type / scroll / wait / press).
2. **Playwright + Browserless** (`browser.js`) connects to a remote Chromium
   instance over CDP, executes the plan, and either takes a full-page
   screenshot or records video for the requested duration.
3. **Express** (`server.js`) exposes `/api/chat` and serves the resulting
   file back to the chat UI (`public/index.html`).

## v0 scope (intentional)

This is deliberately narrow right now:
- Two output types only: screenshot, video. No live-session streaming, no
  file-download extraction yet — add those later if you actually reach for
  them.
- No auth, no user accounts, no persistence beyond local files in
  `outputs/`. This is a personal workflow tool, not a multi-user product.
- No login/paywall bypassing — the planner is explicitly told not to invent
  credentials.

## Local setup

```bash
cp .env.example .env   # fill in GROQ_API_KEY and BROWSERLESS_API_KEY
npm install
npm start
```

Visit http://localhost:3000

## Deploying (Render)

This needs a long-running process (not a serverless function) because video
recording can take up to 60 seconds per request. Deploy as a Render **Web
Service**:

- Build command: `npm install`
- Start command: `npm start`
- Env vars: `GROQ_API_KEY`, `BROWSERLESS_API_KEY`

## Notes / things to watch

- **Cost**: video jobs hold a remote browser session open for the full
  recording duration — this is the expensive part of the product. Screenshot
  jobs are cheap and fast by comparison.
- **Copyright**: recording playback of copyrighted video content (e.g. a
  specific YouTube video) for personal use is a different risk profile than
  offering that as a feature to other people via an API/product. Keep that
  distinction in mind if this ever grows beyond a personal tool.
- **Selectors**: the planner guesses at CSS/text selectors without seeing the
  live DOM, so some prompts will fail on sites with unusual markup. This is
  a known v0 limitation — worth watching for common failure patterns once
  you're using it daily.
