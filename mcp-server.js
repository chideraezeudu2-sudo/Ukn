require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { z } = require("zod");

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

const { planActions } = require("./agent");
const { executePlan, OUTPUT_DIR } = require("./browser");

const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

function buildErrorResponse(jobId, err) {
  const content = [{ type: "text", text: `Error: ${err.message}` }];
  const debugPath = path.join(OUTPUT_DIR, `${jobId}-debug.png`);
  if (fs.existsSync(debugPath)) {
    content.push({
      type: "image",
      data: fs.readFileSync(debugPath).toString("base64"),
      mimeType: "image/png",
    });
  }
  return { isError: true, content };
}

function buildServer() {
  const server = new McpServer({ name: "ukn", version: "0.2.0" });

  server.registerTool(
    "take_screenshot",
    {
      title: "Take a screenshot",
      description:
        "Send a natural-language instruction describing what to look at on the web " +
        "(e.g. 'go to youtube.com and search for lofi hip hop', or 'go to " +
        "https://example.com/product and scroll to the reviews'). A real cloud " +
        "browser navigates and interacts as needed, then returns a full-page " +
        "screenshot as an image plus a downloadable URL.",
      inputSchema: {
        instruction: z.string().describe("What to look at / do before capturing the screenshot"),
      },
    },
    async ({ instruction }) => {
      const jobId = crypto.randomUUID();
      try {
        const plan = await planActions(instruction);
        plan.output = "screenshot"; // force, regardless of what the planner guessed
        const result = await executePlan(plan, jobId);
        const url = `${PUBLIC_BASE_URL}/outputs/${path.basename(result.filePath)}`;
        const imageBase64 = fs.readFileSync(result.filePath).toString("base64");

        return {
          content: [
            { type: "text", text: `Screenshot captured. Goal: ${plan.goal}\nURL: ${url}` },
            { type: "image", data: imageBase64, mimeType: "image/png" },
          ],
        };
      } catch (err) {
        return buildErrorResponse(jobId, err);
      }
    }
  );

  server.registerTool(
    "record_video",
    {
      title: "Record a video clip",
      description:
        "Send a natural-language instruction describing what to do/watch on the web " +
        "(e.g. 'go to youtube.com, search for lofi hip hop radio, and record the " +
        "first 15 seconds'). A real cloud browser navigates and interacts as " +
        "needed while recording, then returns a downloadable video URL. Videos " +
        "are not embedded inline (too large) — use the returned URL to view or " +
        "download the clip.",
      inputSchema: {
        instruction: z.string().describe("What to do / watch before and during the recording"),
        seconds: z
          .number()
          .min(3)
          .max(60)
          .optional()
          .describe("How many seconds to record, default 15, max 60"),
      },
    },
    async ({ instruction, seconds }) => {
      const jobId = crypto.randomUUID();
      try {
        const plan = await planActions(instruction);
        plan.output = "video";
        if (seconds) plan.record_seconds = Math.min(Math.max(seconds, 3), 60);
        const result = await executePlan(plan, jobId);
        const url = `${PUBLIC_BASE_URL}/outputs/${path.basename(result.filePath)}`;

        return {
          content: [
            {
              type: "text",
              text: `Video recorded (${plan.record_seconds}s). Goal: ${plan.goal}\nDownload/view: ${url}`,
            },
          ],
        };
      } catch (err) {
        return buildErrorResponse(jobId, err);
      }
    }
  );

  return server;
}

const app = express();
app.use(express.json());
app.use("/outputs", express.static(OUTPUT_DIR));
app.get("/healthz", (_req, res) => res.send("ok"));

// Stateless mode: a fresh server + transport per request, which is the
// simplest correct setup for a single-user personal tool like this one.
app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed. This server only supports POST /mcp." });
});

app.listen(PORT, () => {
  console.log(`ukn MCP server listening on :${PORT}`);
  console.log(`MCP endpoint: ${PUBLIC_BASE_URL}/mcp`);
});
