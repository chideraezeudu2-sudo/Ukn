const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// The set of actions the browser executor knows how to run.
// Keeping this list small and explicit on purpose for v0 (see README).
const ACTION_SCHEMA = `
You are a planning module for a browser automation agent. Given a user's
natural-language request, output ONLY a JSON object (no markdown, no
commentary) with this exact shape:

{
  "goal": "short restatement of what the user wants",
  "output": "screenshot" | "video",
  "record_seconds": number,       // only relevant if output is "video", default 15, max 60
  "steps": [
    { "action": "goto", "url": "https://..." },
    { "action": "click", "selector": "css selector or text=..." },
    { "action": "type", "selector": "css selector", "text": "..." },
    { "action": "wait", "ms": 1000 },
    { "action": "scroll", "amount": 800 },
    { "action": "press", "key": "Enter" }
  ]
}

Rules:
- Prefer Playwright-style "text=" selectors when targeting visible buttons/
  links (e.g. "text=Search", "text=Sign in") since you cannot see the live
  DOM. For text INPUT fields, prefer stable attribute selectors over guessing
  visible text, e.g.:
  - YouTube search box: 'input#search' with a fallback of 'input[name="search_query"]'
  - Google search box: 'textarea[name="q"]' (Google uses a textarea, not input)
  - Amazon search box: 'input#twotabsearchtextbox'
  When unsure, use a broad attribute selector like 'input[type="search"]' or
  'input[name*="search" i]' rather than an id you're not confident about.
- Always start with a "goto" step to a real URL. Infer the most sensible
  starting URL from the request (e.g. youtube.com, amazon.com, google.com).
- After typing into a search box, prefer a "press" step with key "Enter"
  over trying to click a search button, since button selectors vary more
  across sites than the Enter key does.
- Keep the step list short (3-8 steps). Insert small "wait" steps (500-1500ms)
  after navigation or clicks so the page can load before the next action.
- If the request just says to "look at" or "check out" or "show me" a page
  with no interaction implied, output = "screenshot" and steps can be just
  goto (+ optional wait/scroll).
- If the request implies watching something happen, playing a video, an
  animation, or a multi-step flow, output = "video".
- Never invent login credentials or attempt to bypass paywalls/CAPTCHAs.
`;

async function planActions(userPrompt) {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    temperature: 0.2,
    messages: [
      { role: "system", content: ACTION_SCHEMA },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0].message.content;
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (err) {
    throw new Error("Agent returned invalid JSON plan: " + raw);
  }

  // Basic guardrails/defaults
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error("Agent plan had no steps");
  }
  if (plan.output !== "video") plan.output = "screenshot";
  plan.record_seconds = Math.min(Math.max(Number(plan.record_seconds) || 15, 3), 60);

  return plan;
}

module.exports = { planActions };
