const Submission = require("../models/Submission");

const buildQuizFilter = (quizNumber) => {
  if (!quizNumber) {
    return {};
  }

  // Backward compatibility for existing records created before quizNumber existed.
  if (quizNumber === 1) {
    return {
      $or: [{ quizNumber: 1 }, { quizNumber: { $exists: false } }],
    };
  }

  return { quizNumber };
};

const getLeaderboardEntries = async ({ limit = 20, quizNumber } = {}) => {
  const matchStage = buildQuizFilter(quizNumber);
  const entries = await Submission.aggregate([
    { $match: matchStage },
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
        quizNumber: { $ifNull: ["$quizNumber", 1] },
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

const getAvailableQuizzes = async () => {
  const quizzes = await Submission.aggregate([
    {
      $project: {
        quizNumber: { $ifNull: ["$quizNumber", 1] },
      },
    },
    {
      $group: {
        _id: "$quizNumber",
        attempts: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        quizNumber: "$_id",
        attempts: 1,
      },
    },
    { $sort: { quizNumber: 1 } },
  ]);

  return quizzes;
};

module.exports = { getLeaderboardEntries, getAvailableQuizzes, buildQuizFilter };
