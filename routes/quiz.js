const express = require("express");
const crypto = require("crypto");
const Question = require("../models/Question");
const Player = require("../models/Player");
const QuizSession = require("../models/QuizSession");
const Submission = require("../models/Submission");
const { secureShuffle } = require("../utils/shuffle");
const { leaderboardEmitter } = require("../utils/leaderboardEmitter");
const { getLeaderboardEntries } = require("../utils/leaderboard");

const router = express.Router();

const sanitizeQuestion = (question) => ({
  id: question._id.toString(),
  prompt: question.prompt,
  options: question.options,
  category: question.category,
  difficulty: question.difficulty,
});

router.post("/start", async (req, res) => {
  try {
    const { name, email, organization } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required." });
    }

    const questionCount = Number(process.env.QUIZ_QUESTION_COUNT || 8);
    const durationMs = Number(process.env.QUIZ_DURATION_MS || 240000);

    const questions = await Question.find().lean();
    if (!questions.length || questions.length < questionCount) {
      return res.status(400).json({ error: "Not enough questions available." });
    }

    const selected = secureShuffle(questions).slice(0, questionCount);
    const player = await Player.create({
      name: name.trim(),
      email: email ? email.trim() : undefined,
      organization: organization ? organization.trim() : undefined,
    });

    const sessionId = crypto.randomUUID();
    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + durationMs);

    await QuizSession.create({
      sessionId,
      playerId: player._id,
      questionIds: selected.map((question) => question._id),
      startedAt,
      expiresAt,
      durationMs,
    });

    return res.json({
      sessionId,
      player: {
        id: player._id,
        name: player.name,
      },
      questions: selected.map(sanitizeQuestion),
      startedAt: startedAt.getTime(),
      expiresAt: expiresAt.getTime(),
      durationMs,
      serverTime: Date.now(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to start quiz session." });
  }
});

router.get("/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await QuizSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    if (session.submittedAt) {
      return res.status(409).json({ error: "Session already submitted." });
    }

    const now = Date.now();
    if (now > session.expiresAt.getTime()) {
      return res.status(410).json({ error: "Session expired." });
    }

    const questions = await Question.find({ _id: { $in: session.questionIds } }).lean();
    const questionMap = new Map(questions.map((question) => [question._id.toString(), question]));
    const ordered = session.questionIds
      .map((id) => questionMap.get(id.toString()))
      .filter(Boolean)
      .map(sanitizeQuestion);

    return res.json({
      sessionId: session.sessionId,
      questions: ordered,
      startedAt: session.startedAt.getTime(),
      expiresAt: session.expiresAt.getTime(),
      durationMs: session.durationMs,
      serverTime: Date.now(),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load session." });
  }
});

router.post("/submit", async (req, res) => {
  try {
    const { sessionId, answers = [] } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required." });
    }

    const session = await QuizSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    if (session.submittedAt) {
      return res.status(409).json({ error: "Session already submitted." });
    }

    const questionDocs = await Question.find({ _id: { $in: session.questionIds } }).lean();
    const questionMap = new Map(questionDocs.map((question) => [question._id.toString(), question]));

    let score = 0;
    const detailedAnswers = answers
      .map((answer) => {
        const question = questionMap.get(answer.questionId);
        if (!question) return null;
        const correct = answer.optionIndex === question.correctIndex;
        if (correct) {
          score += 1;
        }
        return {
          questionId: question._id,
          optionIndex: answer.optionIndex,
          correct,
        };
      })
      .filter(Boolean);

    const now = Date.now();
    const timeTakenMs = Math.min(now - session.startedAt.getTime(), session.durationMs);
    const totalQuestions = session.questionIds.length;

    const submission = await Submission.create({
      sessionId,
      playerId: session.playerId,
      answers: detailedAnswers,
      score,
      totalQuestions,
      timeTakenMs,
      submittedAt: new Date(),
    });

    session.submittedAt = new Date();
    session.score = score;
    session.timeTakenMs = timeTakenMs;
    await session.save();

    const entries = await getLeaderboardEntries(20);
    leaderboardEmitter.emit("update", entries);

    return res.json({
      sessionId,
      submissionId: submission._id,
      score,
      totalQuestions,
      timeTakenMs,
      leaderboard: entries,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to submit quiz." });
  }
});

module.exports = router;
