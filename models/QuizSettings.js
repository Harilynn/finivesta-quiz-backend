const mongoose = require("mongoose");

const QuizSettingsSchema = new mongoose.Schema(
  {
    questionCount: { type: Number, default: 10, min: 1, max: 100 },
    durationMs: { type: Number, default: 300000, min: 30000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizSettings", QuizSettingsSchema);
