const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");

const OUTPUT_DIR = path.join(__dirname, "outputs");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function browserlessWsEndpoint() {
  const token = process.env.BROWSERLESS_API_KEY;
  if (!token) throw new Error("BROWSERLESS_API_KEY is not set");
  // Browserless.io production WS endpoint. If you're on a self-hosted or
  // regional Browserless instance, override with BROWSERLESS_WS_URL.
  return (
    process.env.BROWSERLESS_WS_URL ||
    `wss://production-sfo.browserless.io?token=${token}`
  );
}

async function dismissCommonConsentDialogs(page) {
  // Best-effort: click a common cookie/consent "accept" button if present,
  // without failing the run if none exists.
  const candidates = [
    "text=Accept all",
    "text=I agree",
    "text=Accept cookies",
    "text=Reject all",
    'button[aria-label="Accept all"]',
  ];
  for (const sel of candidates) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 })) {
        await el.click({ timeout: 2000 });
        await page.waitForTimeout(500);
        return;
      }
    } catch {
      // Selector not present or not clickable in time — ignore and continue.
    }
  }
}

async function runStep(page, step) {
  switch (step.action) {
    case "goto":
      await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      try {
        await page.waitForLoadState("networkidle", { timeout: 8000 });
      } catch {
        // Some pages never go fully idle (ads, polling widgets) — fine to proceed.
      }
      await dismissCommonConsentDialogs(page);
      break;
    case "click": {
      const locator = page.locator(step.selector).first();
      await locator.waitFor({ state: "visible", timeout: 15000 });
      await locator.click({ timeout: 15000 });
      break;
    }
    case "type": {
      const locator = page.locator(step.selector).first();
      await locator.waitFor({ state: "visible", timeout: 15000 });
      await locator.fill(step.text, { timeout: 15000 });
      break;
    }
    case "press":
      await page.keyboard.press(step.key);
      break;
    case "scroll":
      await page.mouse.wheel(0, step.amount || 600);
      break;
    case "wait":
      await page.waitForTimeout(step.ms || 1000);
      break;
    default:
      // Unknown action types are skipped rather than failing the whole run.
      console.warn("Skipping unknown action:", step.action);
  }
}

async function executePlan(plan, jobId) {
  const browser = await chromium.connectOverCDP(browserlessWsEndpoint());
  const contextOptions = {
    viewport: { width: 1280, height: 800 },
  };

  let videoDir;
  if (plan.output === "video") {
    videoDir = path.join(OUTPUT_DIR, jobId);
    fs.mkdirSync(videoDir, { recursive: true });
    contextOptions.recordVideo = { dir: videoDir, size: { width: 1280, height: 800 } };
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  let resultPath;
  try {
    for (const step of plan.steps) {
      await runStep(page, step);
    }

    if (plan.output === "video") {
      // Let the recording run for the requested duration after the scripted
      // steps finish, so animations/playback have time to be captured.
      await page.waitForTimeout(plan.record_seconds * 1000);
    } else {
      resultPath = path.join(OUTPUT_DIR, `${jobId}.png`);
      await page.screenshot({ path: resultPath, fullPage: true });
    }
  } finally {
    await context.close(); // flushes the video file to disk
    await browser.close();
  }

  if (plan.output === "video") {
    const video = page.video();
    const savedPath = video ? await video.path() : null;
    if (!savedPath) throw new Error("Video recording failed to save");
    resultPath = path.join(OUTPUT_DIR, `${jobId}.webm`);
    fs.renameSync(savedPath, resultPath);
    fs.rmSync(videoDir, { recursive: true, force: true });
  }

  return { type: plan.output, filePath: resultPath };
}

module.exports = { executePlan, OUTPUT_DIR, runStep };
