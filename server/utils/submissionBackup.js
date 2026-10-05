const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const User = require('../models/User');

const BACKUP_PATHS = [
  path.join(__dirname, '../data/submissions_backup.json'),
  path.join(__dirname, '../submissions_backup.json'),
  path.join(__dirname, '../../submissions_backup.json'),
];

/**
 * Save all submission records to JSON backup files so participant scores
 * persist even if MongoDB memory server restarts or Atlas re-connects.
 */
const saveSubmissionBackup = async () => {
  try {
    const Submission = mongoose.model('Submission');
    const submissions = await Submission.find({}).lean();

    if (!submissions || submissions.length === 0) {
      return;
    }

    const backupData = submissions.map((s) => ({
      ...s,
      _id: s._id ? s._id.toString() : undefined,
      userId: s.userId ? s.userId.toString() : null,
      adminReviewedBy: s.adminReviewedBy ? s.adminReviewedBy.toString() : null,
      answers: (s.answers || []).map((a) => ({
        ...a,
        _id: a._id ? a._id.toString() : undefined,
        questionId: a.questionId ? a.questionId.toString() : null,
      })),
    }));

    const jsonStr = JSON.stringify(backupData, null, 2);
    let savedAny = false;

    for (const fileLoc of BACKUP_PATHS) {
      try {
        const dataDir = path.dirname(fileLoc);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(fileLoc, jsonStr, 'utf-8');
        savedAny = true;
      } catch (_) {
        // Skip if directory is read-only
      }
    }

    if (savedAny) {
      console.log(` [BACKUP] Saved ${backupData.length} submission score record(s) to backup JSON.`);
    }
  } catch (err) {
    console.error(' [BACKUP] Failed to save submissions backup:', err.message);
  }
};

/**
 * Restore submission records from JSON backup files into MongoDB if missing.
 */
const restoreSubmissionBackup = async () => {
  try {
    const Submission = mongoose.model('Submission');
    let restoredCount = 0;
    let backupSubmissions = [];

    for (const fileLoc of BACKUP_PATHS) {
      try {
        if (fs.existsSync(fileLoc)) {
          const content = fs.readFileSync(fileLoc, 'utf-8');
          if (content && content.trim()) {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed) && parsed.length > 0) {
              backupSubmissions = parsed;
              break;
            }
          }
        }
      } catch (_) {
        // Try next location
      }
    }

    if (backupSubmissions.length === 0) return;

    for (const subData of backupSubmissions) {
      if (!subData.userId || !subData.round) continue;
      try {
        const existing = await Submission.findOne({
          $or: [
            { _id: subData._id },
            { userId: subData.userId, round: subData.round },
          ],
        });
        if (!existing) {
          const doc = {
            ...subData,
            _id: new mongoose.Types.ObjectId(subData._id),
            userId: new mongoose.Types.ObjectId(subData.userId),
            adminReviewedBy: subData.adminReviewedBy ? new mongoose.Types.ObjectId(subData.adminReviewedBy) : undefined,
            startedAt: subData.startedAt ? new Date(subData.startedAt) : new Date(),
            submittedAt: subData.submittedAt ? new Date(subData.submittedAt) : undefined,
            createdAt: subData.createdAt ? new Date(subData.createdAt) : new Date(),
            updatedAt: subData.updatedAt ? new Date(subData.updatedAt) : new Date(),
            answers: (subData.answers || []).map((a) => ({
              ...a,
              _id: a._id ? new mongoose.Types.ObjectId(a._id) : undefined,
              questionId: a.questionId ? new mongoose.Types.ObjectId(a.questionId) : undefined,
            })),
          };

          await Submission.collection.insertOne(doc);
          restoredCount++;
        }
      } catch (subErr) {
        console.warn(` [BACKUP] Skip single submission restore for user "${subData.userId}" round ${subData.round}:`, subErr.message);
      }
    }

    if (restoredCount > 0) {
      console.log(` [BACKUP] Restored ${restoredCount} submission score record(s) from JSON backup.`);
    }
  } catch (err) {
    console.error(' [BACKUP] Failed to restore submissions from backup:', err.message);
  }
};

module.exports = { saveSubmissionBackup, restoreSubmissionBackup };
