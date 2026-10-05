require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const Submission = require('../models/Submission');
const { generateAllRoundsLeaderboardPDF } = require('../utils/pdfGenerator');

async function exportPDF() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (uri) {
    console.log('Connecting to MongoDB URI...');
    await mongoose.connect(uri);
  } else {
    // Fallback to local memory server if MONGODB_URI not in env
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const dataDir = path.join(__dirname, '../data');
    const mongod = await MongoMemoryServer.create({
      instance: {
        dbPath: dataDir,
        storageEngine: 'wiredTiger',
        keepData: true,
        dbName: 'code-breakers',
      },
    });
    const localUri = mongod.getUri('code-breakers');
    console.log('Connecting to Local Mongo instance at:', localUri);
    await mongoose.connect(localUri);
  }

  console.log('Fetching participants and submissions...');
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

  qualified.sort((a, b) => {
    if (b.cumulative !== a.cumulative) return b.cumulative - a.cumulative;
    if (a.submittedAt && b.submittedAt) return new Date(a.submittedAt) - new Date(b.submittedAt);
    return 0;
  });

  qualified.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  console.log(`Found ${qualified.length} participants who completed all 3 rounds.`);

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

  const exportsDir = path.join(__dirname, '../../exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  const outputPath = path.join(exportsDir, 'code_breakers_all_3_rounds_results.pdf');
  fs.writeFileSync(outputPath, pdfBuffer);
  console.log(`\n✔ PDF Report generated successfully (${pdfBuffer.length} bytes)!`);
  console.log(`Saved to: ${outputPath}`);

  await mongoose.disconnect();
}

exportPDF()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Export error:', err);
    process.exit(1);
  });
