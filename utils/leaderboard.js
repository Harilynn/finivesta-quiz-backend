const Submission = require("../models/Submission");

const getLeaderboardEntries = async (limit = 20) => {
  const entries = await Submission.aggregate([
    { $sort: { score: -1, timeTakenMs: 1, submittedAt: 1 } },
    { $limit: Number(limit) || 20 },
    {
      $lookup: {
        from: "players",
        localField: "playerId",
        foreignField: "_id",
        as: "player",
      },
    },
    { $unwind: "$player" },
    {
      $project: {
        sessionId: 1,
        score: 1,
        totalQuestions: 1,
        timeTakenMs: 1,
        submittedAt: 1,
        playerName: "$player.name",
      },
    },
  ]);

  return entries;
};

module.exports = { getLeaderboardEntries };
