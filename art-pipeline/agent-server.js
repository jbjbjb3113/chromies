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

const repoRoot = path.resolve(__dirname, "..");
const requireFromRoot = createRequire(path.join(repoRoot, "package.json"));
requireFromRoot("dotenv").config({ path: path.resolve(repoRoot, ".env") });
requireFromRoot("dotenv").config({ path: path.resolve(repoRoot, ".env.local") });

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
  res.sendFile(path.resolve(__dirname, "agent-ui.html"));
});

app.get("/health", (req, res) => {
  res.json({ apiKeySet: !!process.env.ANTHROPIC_API_KEY?.trim() });
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
      image1024Filename: result.image1024Filename,
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
  if (!fs.existsSync(filePath)) {
    console.warn(`[/image] not found: ${filePath}`);
    return res.status(404).json({ error: "Not found", path: filePath });
  }
  res.setHeader("Content-Type", "image/png");
  res.send(fs.readFileSync(filePath));
});

app.listen(PORT, () => {
  console.log(`Chromie Agent server: http://localhost:${PORT}/`);
  console.log(`  Agent images:  ${AGENT_DIR}`);
  console.log(`  POST /generate  { description, previousTraits? }`);
  console.log(`  GET  /health`);
  console.log(`  GET  /image/:filename`);
  console.log(`  POST /save      { filename }`);
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.warn("  WARN: ANTHROPIC_API_KEY not set — generation will fail until configured");
  }
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} already in use — kill the stale agent-server.js process and restart.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
