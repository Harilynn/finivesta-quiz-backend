const express = require("express");
const { leaderboardEmitter } = require("../utils/leaderboardEmitter");
const { getLeaderboardEntries } = require("../utils/leaderboard");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const limit = req.query.limit || 20;
    const entries = await getLeaderboardEntries(limit);
    return res.json({ entries });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch leaderboard." });
  }
});

router.get("/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEntries = async () => {
    const entries = await getLeaderboardEntries(20);
    res.write(`data: ${JSON.stringify({ entries })}\n\n`);
  };

  await sendEntries();

  const handler = async (entries) => {
    res.write(`data: ${JSON.stringify({ entries })}\n\n`);
  };

  leaderboardEmitter.on("update", handler);

  req.on("close", () => {
    leaderboardEmitter.off("update", handler);
    res.end();
  });
});

module.exports = router;
