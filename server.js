require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");

const { planActions } = require("./agent");
const { executePlan, OUTPUT_DIR } = require("./browser");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/outputs", express.static(OUTPUT_DIR));

app.post("/api/chat", async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing 'prompt' string in request body" });
  }

  const jobId = crypto.randomUUID();

  try {
    const plan = await planActions(prompt);
    const result = await executePlan(plan, jobId);

    res.json({
      ok: true,
      goal: plan.goal,
      type: result.type,
      url: `/outputs/${path.basename(result.filePath)}`,
    });
  } catch (err) {
    console.error("Job failed:", jobId, err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/healthz", (_req, res) => res.send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ukn server listening on :${PORT}`));
