const RoundControl = require('../models/RoundControl');
const Question = require('../models/Question');
const Submission = require('../models/Submission');
const { executeCode, isOutputMatch } = require('../utils/codeExecutor');
const { ROUND_CONFIG } = require('../utils/roundConfig');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize a string answer for comparison (trim + lowercase) */
const normalize = (str) => String(str ?? '').trim().toLowerCase();

/** Check if round is unlocked, participant hasn't submitted, and deadline not passed */
const checkRoundAccess = async (userId, roundNum) => {
  const control = await RoundControl.findOne({ round: roundNum });
  if (!control || !control.isUnlocked) {
    return { allowed: false, reason: 'SECTOR LOCKED — AWAITING CLEARANCE', status: 403 };
  }

  // Check time limit
  if (control.durationMinutes && control.unlockedAt) {
    const elapsed = (Date.now() - new Date(control.unlockedAt).getTime()) / 60000;
    if (elapsed > control.durationMinutes) {
      return { allowed: false, reason: 'Time limit has expired for this round', status: 403 };
    }
  }

  const existingSubmit = await Submission.findOne({
    userId,
    round: roundNum,
    status: { $in: ['submitted', 'pending-review'] },
  });

  if (existingSubmit) {
    return { allowed: false, reason: 'Already submitted', status: 409, submission: existingSubmit };
  }

  return { allowed: true };
};

// ─── GET /api/rounds/status ───────────────────────────────────────────────────
const getRoundStatus = async (req, res) => {
  try {
    const controls = await RoundControl.find().sort({ round: 1 });
    const submissions = await Submission.find({
      userId: req.user._id,
      status: { $in: ['submitted', 'pending-review'] },
    }).select('round totalScore status submittedAt');

    const submissionMap = {};
    submissions.forEach((s) => (submissionMap[s.round] = s));

    const status = [1, 2, 3].map((round) => {
      const ctrl = controls.find((c) => c.round === round) || { isUnlocked: false };
      const sub = submissionMap[round];
      const cfg = ROUND_CONFIG[round];

      let timeRemaining = null;
      if (ctrl.isUnlocked && ctrl.durationMinutes && ctrl.unlockedAt) {
        const elapsed = (Date.now() - new Date(ctrl.unlockedAt).getTime()) / 1000;
        timeRemaining = Math.max(0, ctrl.durationMinutes * 60 - elapsed);
      }

      return {
        round,
        name: cfg.name,
        maxQuestions: cfg.maxQuestions,
        marksPerQuestion: cfg.marksPerQuestion,
        maxMarks: cfg.maxMarks,
        isUnlocked: ctrl.isUnlocked,
        durationMinutes: ctrl.durationMinutes,
        unlockedAt: ctrl.unlockedAt,
        timeRemainingSeconds: timeRemaining,
        submitted: !!sub,
        score: sub ? sub.totalScore : null,
        submissionStatus: sub ? sub.status : null,
        submittedAt: sub ? sub.submittedAt : null,
      };
    });

    res.json({ rounds: status });
  } catch (err) {
    console.error('getRoundStatus error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── GET /api/rounds/final-result ─────────────────────────────────────────────
const getFinalResult = async (req, res) => {
  try {
    const submissions = await Submission.find({
      userId: req.user._id,
      status: { $in: ['submitted', 'pending-review'] },
    });

    const subMap = {};
    submissions.forEach((s) => (subMap[s.round] = s));

    const round1Score = subMap[1] ? subMap[1].totalScore : 0;
    const round2Score = subMap[2] ? subMap[2].totalScore : 0;
    const round3Score = subMap[3] ? subMap[3].totalScore : 0;

    const totalScore = round1Score + round2Score + round3Score;
    const percentage = Math.round((totalScore / 100) * 100);

    res.json({
      round1: { score: round1Score, maxMarks: 30, submitted: !!subMap[1] },
      round2: { score: round2Score, maxMarks: 30, submitted: !!subMap[2] },
      round3: { score: round3Score, maxMarks: 40, submitted: !!subMap[3] },
      totalScore,
      maxTotalMarks: 100,
      percentage,
      isFullyCompleted: !!(subMap[1] && subMap[2] && subMap[3]),
    });
  } catch (err) {
    console.error('getFinalResult error:', err);
    res.status(500).json({ message: 'Server error getting final result' });
  }
};

// ─── ROUND 1 (Basic: 15 questions, 2 marks each = 30 marks) ─────────────────

const getRound1Questions = async (req, res) => {
  try {
    const access = await checkRoundAccess(req.user._id, 1);
    if (!access.allowed && access.status !== 409) {
      return res.status(access.status).json({ message: access.reason });
    }

    const inProgress = await Submission.findOne({ userId: req.user._id, round: 1, status: 'in-progress' });
    if (inProgress) {
      const questionIds = inProgress.answers.map((a) => a.questionId);
      const questions = await Question.find({ _id: { $in: questionIds }, round: 1, isActive: true })
        .select('-correctOptionIndex -correctAnswer')
        .sort({ order: 1 });

      const ctrl = await RoundControl.findOne({ round: 1 });
      let timeRemainingSeconds = null;
      if (ctrl && ctrl.isUnlocked && ctrl.durationMinutes && ctrl.unlockedAt) {
        const elapsed = (Date.now() - new Date(ctrl.unlockedAt).getTime()) / 1000;
        timeRemainingSeconds = Math.max(0, Math.floor(ctrl.durationMinutes * 60 - elapsed));
      }

      return res.json({
        questions,
        startedAt: inProgress.startedAt,
        roundControl: {
          durationMinutes: ctrl?.durationMinutes || null,
          unlockedAt: ctrl?.unlockedAt || null,
          timeRemainingSeconds,
        },
      });
    }

    // Fresh start: fetch active Round 1 questions (up to 15)
    const questions = await Question.find({ round: 1, isActive: true })
      .select('-correctOptionIndex -correctAnswer')
      .sort({ order: 1, createdAt: 1 })
      .limit(ROUND_CONFIG[1].maxQuestions);

    // Create in-progress submission record
    await Submission.create({
      userId: req.user._id,
      round: 1,
      answers: questions.map((q) => ({ questionId: q._id, submittedAnswer: null, isCorrect: false, pointsAwarded: 0 })),
      status: 'in-progress',
      startedAt: new Date(),
    });

    const ctrl = await RoundControl.findOne({ round: 1 });
    let timeRemainingSeconds = null;
    if (ctrl && ctrl.isUnlocked && ctrl.durationMinutes && ctrl.unlockedAt) {
      const elapsed = (Date.now() - new Date(ctrl.unlockedAt).getTime()) / 1000;
      timeRemainingSeconds = Math.max(0, Math.floor(ctrl.durationMinutes * 60 - elapsed));
    }

    res.json({
      questions,
      startedAt: new Date(),
      roundControl: {
        durationMinutes: ctrl?.durationMinutes || null,
        unlockedAt: ctrl?.unlockedAt || null,
        timeRemainingSeconds,
      },
    });
  } catch (err) {
    console.error('getRound1Questions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const submitRound1 = async (req, res) => {
  try {
    const access = await checkRoundAccess(req.user._id, 1);
    if (!access.allowed && access.status === 409) {
      return res.status(409).json({ message: 'Already submitted for Round 1', submission: access.submission });
    }
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.reason });
    }

    const { answers } = req.body;
    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Answers array is required' });
    }

    const questionIds = answers.map((a) => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds }, round: 1 });
    const qMap = {};
    questions.forEach((q) => (qMap[q._id.toString()] = q));

    let totalScore = 0;
    const marksPerQ = ROUND_CONFIG[1].marksPerQuestion; // 2 marks

    const gradedAnswers = answers.map((ans) => {
      const q = qMap[ans.questionId];
      if (!q) return { questionId: ans.questionId, submittedAnswer: ans.selectedOptionIndex, isCorrect: false, pointsAwarded: 0 };

      let isCorrect = false;
      if (ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null && ans.selectedOptionIndex !== -1) {
        if (q.correctOptionIndex !== undefined) {
          isCorrect = q.correctOptionIndex === ans.selectedOptionIndex;
        } else if (q.correctAnswer) {
          const selectedText = q.options[ans.selectedOptionIndex];
          isCorrect = normalize(selectedText) === normalize(q.correctAnswer);
        }
      }

      const points = isCorrect ? marksPerQ : 0;
      totalScore += points;
      return {
        questionId: ans.questionId,
        submittedAnswer: ans.selectedOptionIndex,
        isCorrect,
        pointsAwarded: points,
        timeTakenSeconds: ans.timeTakenSeconds || 0,
      };
    });

    const submission = await Submission.findOneAndUpdate(
      { userId: req.user._id, round: 1 },
      { answers: gradedAnswers, totalScore, submittedAt: new Date(), status: 'submitted' },
      { new: true, upsert: true }
    );

    res.json({ message: 'Round 1 submitted!', totalScore, maxMarks: ROUND_CONFIG[1].maxMarks, submission });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Already submitted for Round 1' });
    console.error('submitRound1 error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── ROUND 2 (Intermediate: 10 questions, 3 marks each = 30 marks) ───────────

const getRound2Questions = async (req, res) => {
  try {
    const access = await checkRoundAccess(req.user._id, 2);
    if (!access.allowed && access.status !== 409) {
      return res.status(access.status).json({ message: access.reason });
    }

    const questions = await Question.find({ round: 2, isActive: true })
      .select('-correctOutput -correctAnswer -correctOptionIndex')
      .sort({ order: 1, createdAt: 1 })
      .limit(ROUND_CONFIG[2].maxQuestions);

    const ctrl = await RoundControl.findOne({ round: 2 });
    let timeRemainingSeconds = null;
    if (ctrl && ctrl.isUnlocked && ctrl.durationMinutes && ctrl.unlockedAt) {
      const elapsed = (Date.now() - new Date(ctrl.unlockedAt).getTime()) / 1000;
      timeRemainingSeconds = Math.max(0, Math.floor(ctrl.durationMinutes * 60 - elapsed));
    }

    res.json({
      questions,
      roundControl: {
        durationMinutes: ctrl?.durationMinutes || null,
        unlockedAt: ctrl?.unlockedAt || null,
        timeRemainingSeconds,
      },
    });
  } catch (err) {
    console.error('getRound2Questions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const submitRound2 = async (req, res) => {
  try {
    const access = await checkRoundAccess(req.user._id, 2);
    if (!access.allowed && access.status === 409) {
      return res.status(409).json({ message: 'Already submitted for Round 2', submission: access.submission });
    }
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.reason });
    }

    const { answers } = req.body;
    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Answers array is required' });
    }

    const questionIds = answers.map((a) => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds }, round: 2 });
    const qMap = {};
    questions.forEach((q) => (qMap[q._id.toString()] = q));

    let totalScore = 0;
    const marksPerQ = ROUND_CONFIG[2].marksPerQuestion; // 3 marks

    const gradedAnswers = answers.map((ans) => {
      const q = qMap[ans.questionId];
      if (!q) return { questionId: ans.questionId, submittedAnswer: ans.submittedOutput, isCorrect: false, pointsAwarded: 0 };

      // Support MCQ options or direct code output check
      let isCorrect = false;
      if (ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null && ans.selectedOptionIndex !== -1) {
        if (q.correctOptionIndex !== undefined) {
          isCorrect = q.correctOptionIndex === ans.selectedOptionIndex;
        }
      } else if (ans.submittedOutput !== undefined && ans.submittedOutput !== null) {
        const targetOutput = q.correctOutput || q.correctAnswer;
        isCorrect = normalize(targetOutput) === normalize(ans.submittedOutput);
      }

      const points = isCorrect ? marksPerQ : 0;
      totalScore += points;
      return {
        questionId: ans.questionId,
        submittedAnswer: ans.submittedOutput ?? ans.selectedOptionIndex,
        isCorrect,
        pointsAwarded: points,
        timeTakenSeconds: ans.timeTakenSeconds || 0,
      };
    });

    const submission = await Submission.findOneAndUpdate(
      { userId: req.user._id, round: 2 },
      { answers: gradedAnswers, totalScore, submittedAt: new Date(), status: 'submitted' },
      { new: true, upsert: true }
    );

    res.json({ message: 'Round 2 submitted!', totalScore, maxMarks: ROUND_CONFIG[2].maxMarks, submission });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Already submitted for Round 2' });
    console.error('submitRound2 error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── ROUND 3 (Advanced: 5 questions, 8 marks each = 40 marks) ────────────────

const getRound3Questions = async (req, res) => {
  try {
    const access = await checkRoundAccess(req.user._id, 3);
    if (!access.allowed && access.status !== 409) {
      return res.status(access.status).json({ message: access.reason });
    }

    const questions = await Question.find({ round: 3, isActive: true })
      .select('-expectedOutput -correctOutput -correctAnswer')
      .sort({ order: 1, createdAt: 1 })
      .limit(ROUND_CONFIG[3].maxQuestions);

    const ctrl = await RoundControl.findOne({ round: 3 });
    let timeRemainingSeconds = null;
    if (ctrl && ctrl.isUnlocked && ctrl.durationMinutes && ctrl.unlockedAt) {
      const elapsed = (Date.now() - new Date(ctrl.unlockedAt).getTime()) / 1000;
      timeRemainingSeconds = Math.max(0, Math.floor(ctrl.durationMinutes * 60 - elapsed));
    }

    res.json({
      questions,
      roundControl: {
        durationMinutes: ctrl?.durationMinutes || null,
        unlockedAt: ctrl?.unlockedAt || null,
        timeRemainingSeconds,
      },
    });
  } catch (err) {
    console.error('getRound3Questions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const runRound3Code = async (req, res) => {
  try {
    const { questionId, code } = req.body;
    if (!questionId) {
      return res.status(400).json({ message: 'questionId is required' });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    const targetOutput = question.expectedOutput || question.correctOutput || question.correctAnswer;
    const execResult = await executeCode(code || '', question.language || 'javascript');
    const isCorrect = isOutputMatch(execResult.output, targetOutput);

    res.json({
      success: execResult.success,
      output: execResult.output,
      error: execResult.error,
      isCorrect,
      expectedOutput: targetOutput,
      executionTimeMs: execResult.executionTimeMs,
    });
  } catch (err) {
    console.error('runRound3Code error:', err);
    res.status(500).json({ message: 'Error executing code' });
  }
};

const submitRound3 = async (req, res) => {
  try {
    const access = await checkRoundAccess(req.user._id, 3);
    if (!access.allowed && access.status === 409) {
      return res.status(409).json({ message: 'Already submitted for Round 3', submission: access.submission });
    }
    if (!access.allowed) {
      return res.status(access.status).json({ message: access.reason });
    }

    const { answers } = req.body;
    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Answers array is required' });
    }

    const questionIds = answers.map((a) => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds }, round: 3 });
    const qMap = {};
    questions.forEach((q) => (qMap[q._id.toString()] = q));

    let totalScore = 0;
    const marksPerQ = ROUND_CONFIG[3].marksPerQuestion; // 8 marks
    const gradedAnswers = [];

    for (const ans of answers) {
      const q = qMap[ans.questionId];
      if (!q) {
        gradedAnswers.push({
          questionId: ans.questionId,
          submittedAnswer: ans.correctedCode || ans.selectedOptionIndex || '',
          isCorrect: false,
          pointsAwarded: 0,
          timeTakenSeconds: ans.timeTakenSeconds || 0,
        });
        continue;
      }

      let isCorrect = false;
      const targetOutput = q.expectedOutput || q.correctOutput || q.correctAnswer;

      if (ans.selectedOptionIndex !== undefined && ans.selectedOptionIndex !== null && ans.selectedOptionIndex !== -1) {
        if (q.correctOptionIndex !== undefined) {
          isCorrect = q.correctOptionIndex === ans.selectedOptionIndex;
        }
      } else if (q.buggyCode) {
        const codeToRun = ans.correctedCode ?? q.buggyCode;
        const execResult = await executeCode(codeToRun, q.language || 'javascript');
        isCorrect = isOutputMatch(execResult.output, targetOutput);
      } else if (ans.submittedOutput !== undefined && ans.submittedOutput !== null) {
        isCorrect = normalize(targetOutput) === normalize(ans.submittedOutput);
      }

      const points = isCorrect ? marksPerQ : 0;
      totalScore += points;

      gradedAnswers.push({
        questionId: ans.questionId,
        submittedAnswer: ans.correctedCode ?? ans.submittedOutput ?? ans.selectedOptionIndex ?? '',
        isCorrect,
        pointsAwarded: points,
        timeTakenSeconds: ans.timeTakenSeconds || 0,
      });
    }

    const submission = await Submission.findOneAndUpdate(
      { userId: req.user._id, round: 3 },
      { answers: gradedAnswers, totalScore, submittedAt: new Date(), status: 'submitted' },
      { new: true, upsert: true }
    );

    res.json({
      message: 'Round 3 submitted!',
      totalScore,
      maxMarks: ROUND_CONFIG[3].maxMarks,
      submission,
      status: 'submitted',
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Already submitted for Round 3' });
    console.error('submitRound3 error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getRoundStatus,
  getFinalResult,
  getRound1Questions,
  submitRound1,
  getRound2Questions,
  submitRound2,
  getRound3Questions,
  runRound3Code,
  submitRound3,
};
