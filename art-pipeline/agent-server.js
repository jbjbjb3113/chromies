// ============================================================================
// agent-server.js
// Local Express server for Chromie Agent UI.
//
// USAGE:  node agent-server.js
// Then open agent-ui.html in a browser (or http://localhost:3456/)
// ============================================================================

const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const repoRoot = path.join(__dirname, "..");
const requireFromRoot = createRequire(path.join(repoRoot, "package.json"));

try {
  requireFromRoot("dotenv").config({ path: path.join(repoRoot, ".env") });
  requireFromRoot("dotenv").config({ path: path.join(repoRoot, ".env.local") });
} catch {
  // dotenv optional if env vars set externally
}

const express = requireFromRoot("express");
const { AGENT_DIR, SAVED_DIR, runAgent, saveAgentImage } = require("./chromie-agent");

const PORT = Number(process.env.AGENT_PORT || 3456);
const app = express();

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "agent-ui.html"));
});

app.post("/generate", async (req, res) => {
  try {
    const description = String(req.body?.description || "").trim();
    if (!description) return res.status(400).json({ error: "description is required" });

    const previousTraits = req.body?.previousTraits ?? null;
    const result = await runAgent({ description, previousTraits });
    res.json({
      traits: result.traits,
      slotSummary: result.slotSummary,
      rationale: result.traits.rationale ?? "",
      palette: result.paletteKey,
      character: result.character,
      imageFilename: result.imageFilename,
      imageUrl: result.imageUrl,
      image1024Url: `/image/${result.image1024Filename}`,
    });
  } catch (err) {
    console.error("[/generate]", err.message);
    res.status(500).json({ error: err.message, validationErrors: err.validationErrors ?? null });
  }
});

app.post("/save", (req, res) => {
  try {
    const filename = String(req.body?.filename || "").trim();
    if (!filename || !/^agent_[\w-]+\.png$/.test(filename)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const dest = saveAgentImage(filename);
    res.json({ saved: path.basename(dest), dir: SAVED_DIR });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/image/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!/^agent_[\w-]+(_1024)?\.png$/.test(filename)) {
    return res.status(400).json({ error: "Invalid image name" });
  }
  const filePath = path.join(AGENT_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
  res.setHeader("Content-Type", "image/png");
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Chromie Agent server: http://localhost:${PORT}/`);
  console.log(`  POST /generate  { description, previousTraits? }`);
  console.log(`  GET  /image/:filename`);
  console.log(`  POST /save      { filename }`);
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.warn("  WARN: ANTHROPIC_API_KEY not set — generation will fail until configured");
  }
});
