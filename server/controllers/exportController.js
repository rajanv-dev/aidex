const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const Submission = require('../models/Submission');
const User = require('../models/User');
const Round1Question = require('../models/Round1Question');
const Round2Question = require('../models/Round2Question');
const Round3Question = require('../models/Round3Question');
const { generateAllRoundsLeaderboardPDF } = require('../utils/pdfGenerator');

const QUESTION_MODELS = {
  1: Round1Question,
  2: Round2Question,
  3: Round3Question,
};

/**
 * GET /api/admin/export/:round
 * Export per-round results as CSV or XLSX
 * Query: ?format=csv (default) | xlsx
 */
const exportRound = async (req, res) => {
  try {
    const round = parseInt(req.params.round, 10);
    const format = req.query.format || 'xlsx';

    if (![1, 2, 3].includes(round)) {
      return res.status(400).json({ message: 'Invalid round number' });
    }

    const submissions = await Submission.find({ round, status: { $in: ['submitted', 'pending-review'] } })
      .populate('userId', 'name username teamName');

    const QuestionModel = QUESTION_MODELS[round];
    const questions = await QuestionModel.find({ isActive: true }).sort({ order: 1 });
    const questionMap = {};
    questions.forEach((q) => (questionMap[q._id.toString()] = q));

    const rows = submissions.map((sub) => {
      const row = {
        'Team Name': sub.userId?.teamName || sub.userId?.name || sub.userId?.username || 'Unknown',
        'Total Score': sub.totalScore,
        Status: sub.status,
        'Submitted At': sub.submittedAt ? sub.submittedAt.toISOString() : '',
      };
      sub.answers.forEach((ans, i) => {
        const q = questionMap[ans.questionId?.toString()];
        const label = q ? q.title || q.questionText || `Q${i + 1}` : `Q${i + 1}`;
        row[`${label} (Answer)`] = String(ans.submittedAnswer ?? '');
        row[`${label} (Correct?)`] = ans.isCorrect ? 'Yes' : 'No';
        row[`${label} (Points)`] = ans.pointsAwarded;
      });
      return row;
    });

    const filename = `round${round}_results`;

    if (format === 'csv') {
      const parser = new Parser();
      const csv = parser.parse(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csv);
    }

    // XLSX
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Round ${round} Results`);
    if (rows.length > 0) {
      sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key, width: 25 }));
      rows.forEach((row) => sheet.addRow(row));
      // Header styling
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1a1a1a' },
      };
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportRound error:', err);
    res.status(500).json({ message: 'Export failed' });
  }
};

/**
 * GET /api/admin/export/pdf
 * Export official PDF for all participants who attended all 3 rounds
 */
const exportAllRoundsPDF = async (req, res) => {
  try {
    const participants = await User.find({ role: 'participant', isActive: true });
    const submissions = await Submission.find({ status: { $in: ['submitted', 'pending-review'] } })
      .populate('userId', 'name username teamName');

    const subMap = {};
    submissions.forEach((sub) => {
      const uid = sub.userId?._id?.toString();
      if (!uid) return;
      if (!subMap[uid]) subMap[uid] = {};
      subMap[uid][sub.round] = sub;
    });

    // Filter participants who attended ALL 3 rounds
    const qualified = [];
    participants.forEach((p) => {
      const uid = p._id.toString();
      const userSubs = subMap[uid];
      if (userSubs && userSubs[1] && userSubs[2] && userSubs[3]) {
        const r1 = userSubs[1].totalScore || 0;
        const r2 = userSubs[2].totalScore || 0;
        const r3 = userSubs[3].totalScore || 0;
        const cumulative = r1 + r2 + r3;

        const submitTimes = [userSubs[1].submittedAt, userSubs[2].submittedAt, userSubs[3].submittedAt].filter(Boolean);
        const latestSubmit = submitTimes.length > 0 ? new Date(Math.max(...submitTimes.map((t) => new Date(t).getTime()))) : null;

        qualified.push({
          userId: p._id,
          name: p.name,
          username: p.username,
          teamName: p.teamName || p.name || p.username,
          r1,
          r2,
          r3,
          cumulative,
          percentage: Math.round((cumulative / 100) * 100),
          submittedAt: latestSubmit,
        });
      }
    });

    // Sort by Cumulative Score descending, then by completion time ascending
    qualified.sort((a, b) => {
      if (b.cumulative !== a.cumulative) return b.cumulative - a.cumulative;
      if (a.submittedAt && b.submittedAt) return new Date(a.submittedAt) - new Date(b.submittedAt);
      return 0;
    });

    // Assign Ranks
    qualified.forEach((p, idx) => {
      p.rank = idx + 1;
    });

    const totalScoreSum = qualified.reduce((acc, curr) => acc + curr.cumulative, 0);
    const averageScore = qualified.length > 0 ? Math.round((totalScoreSum / qualified.length) * 10) / 10 : 0;
    const topScore = qualified.length > 0 ? qualified[0].cumulative : 0;

    const meta = {
      eventName: 'CODE BREAKERS 2026 - OFFICIAL LEADERBOARD',
      generatedAt: new Date(),
      totalQualified: qualified.length,
      maxPossibleScore: 100,
      averageScore,
      topScore,
    };

    const pdfBuffer = await generateAllRoundsLeaderboardPDF(qualified, meta);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="code_breakers_all_3_rounds_results.pdf"');
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('exportAllRoundsPDF error:', err);
    res.status(500).json({ message: 'PDF Generation failed', error: err.message });
  }
};

/**
 * GET /api/admin/export/overall
 * Export cumulative results across all rounds (supports format=xlsx | csv | pdf)
 */
const exportOverall = async (req, res) => {
  try {
    const format = req.query.format || 'xlsx';
    const only3Rounds = req.query.attendedAll === 'true' || req.query.only3Rounds === 'true' || format === 'pdf';

    if (format === 'pdf') {
      return exportAllRoundsPDF(req, res);
    }

    const participants = await User.find({ role: 'participant', isActive: true });
    const submissions = await Submission.find({ status: { $in: ['submitted', 'pending-review'] } })
      .populate('userId', 'name username teamName');

    const subMap = {};
    submissions.forEach((sub) => {
      const uid = sub.userId?._id?.toString();
      if (!uid) return;
      if (!subMap[uid]) subMap[uid] = { 1: null, 2: null, 3: null };
      subMap[uid][sub.round] = sub.totalScore;
    });

    let targetParticipants = participants;
    if (only3Rounds) {
      targetParticipants = participants.filter((p) => {
        const uid = p._id.toString();
        const s = subMap[uid];
        return s && s[1] !== null && s[2] !== null && s[3] !== null;
      });
    }

    const rows = targetParticipants
      .map((p) => {
        const uid = p._id.toString();
        const scores = subMap[uid] || { 1: 0, 2: 0, 3: 0 };
        const r1 = scores[1] ?? 0;
        const r2 = scores[2] ?? 0;
        const r3 = scores[3] ?? 0;
        const attendedAll = scores[1] !== null && scores[2] !== null && scores[3] !== null;
        return {
          'Team Name': p.teamName || p.name || p.username,
          Username: p.username,
          'Round 1 Score': r1,
          'Round 2 Score': r2,
          'Round 3 Score': r3,
          'Cumulative Score': r1 + r2 + r3,
          'Attended All 3 Rounds': attendedAll ? 'Yes' : 'No',
        };
      })
      .sort((a, b) => b['Cumulative Score'] - a['Cumulative Score']);

    if (format === 'csv') {
      const parser = new Parser();
      const csv = parser.parse(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="overall_results.csv"');
      return res.send(csv);
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Overall Results');
    if (rows.length > 0) {
      sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key, width: 22 }));
      rows.forEach((row) => sheet.addRow(row));
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1a1a1a' },
      };
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="overall_results.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportOverall error:', err);
    res.status(500).json({ message: 'Export failed' });
  }
};

module.exports = { exportRound, exportOverall, exportAllRoundsPDF };

