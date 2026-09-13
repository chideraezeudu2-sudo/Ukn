# ukn — an MCP tool server for visual browser actions

This is **not** a chat app. It's a small MCP (Model Context Protocol) server
that exposes two tools — `take_screenshot` and `record_video` — so that AI
assistants you already use (Claude, OpenHands, etc.) can call them directly
and hand you back real screenshots and video clips of things happening on
the web.

## What it exposes

- **`take_screenshot(instruction)`** — e.g. "go to youtube.com and search
  lofi hip hop radio". A cloud browser (via Browserless) navigates/interacts
  as needed, then returns a full-page screenshot as an inline image plus a
  URL.
- **`record_video(instruction, seconds?)`** — same idea, but records video
  for up to 60 seconds. The clip is returned **inline** as an embedded binary
  resource (MCP has no dedicated video content type, so it's sent as
  `type: "resource"` with a base64 `video/webm` blob) whenever it fits in the
  inline size limit — plus a public URL that always works as a fallback.

  Clips larger than `MAX_INLINE_MEDIA_BYTES` (default 8 MB) are not embedded,
  to avoid blowing up the MCP response; you still get the URL in that case.

Behind the scenes: **Groq** (`agent.js`) turns your instruction into a short
JSON plan of browser steps (goto/click/type/scroll/wait), and
**Playwright + Browserless** (`browser.js`) executes it in a real remote
Chromium instance.

## Connecting this to Claude

Claude.ai / Claude Desktop support adding **custom remote MCP connectors**.
Once this server is deployed (see below), add it as a connector using its
`/mcp` endpoint, e.g.:

```
https://ukn-agent.onrender.com/mcp
```

Once connected, you can just ask Claude in chat things like "take a
screenshot of youtube.com" and it will call the tool directly and show you
the result — no separate app to open.

## Connecting this to OpenHands

OpenHands supports MCP tool servers too. Point it at the same
`https://ukn-agent.onrender.com/mcp` endpoint and it gains the same two
tools — so it can screenshot or record the frontend it just built for you
instead of you having to open a browser separately to check.

## Local setup

```bash
cp .env.example .env   # fill in GROQ_API_KEY and BROWSERLESS_API_KEY
npm install
npm start               # runs the MCP server on :3000, endpoint at /mcp
```

## Deploying (Render)

Long-running process, not serverless — video recording can take up to 60s.

- Build command: `npm install`
- Start command: `npm start`
- Env vars: `GROQ_API_KEY`, `BROWSERLESS_API_KEY`, `PUBLIC_BASE_URL` (set
  this to your Render service's public URL, e.g.
  `https://ukn-agent.onrender.com`, so returned links are correct), and
  optionally `MAX_INLINE_MEDIA_BYTES` to change the video embed threshold

## v0 scope (intentional)

- Screenshot + video only. No live-session streaming, no file-download
  extraction yet.
- No auth — this is a personal tool. Don't share the `/mcp` URL publicly;
  anyone with it can drive your Browserless account.
- No login/paywall bypassing — the planner is explicitly told not to invent
  credentials.
- A legacy standalone chat demo (the original v0 web app) is still in this
  repo as `server.js` (`npm run start:chat-demo`) if you ever want a
  browser-based fallback, but it's not the primary interface anymore.

## Notes

- **Cost**: video jobs hold a remote browser session open for the full
  recording duration — this is the expensive part. Screenshots are cheap.
- **Copyright**: recording playback of copyrighted video content for
  personal use is a different risk profile than offering that as a feature
  to other people via an API/product.
- **Selectors**: the planner guesses at selectors without seeing the live
  DOM, so unusual site markup can cause a step to fail.
