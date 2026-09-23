const User = require('../models/User');
const Submission = require('../models/Submission');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { normalizeUsername } = require('../utils/normalize');
const { saveUserBackup } = require('../utils/userBackup');

/**
 * POST /api/admin/users
 * Create a single participant account
 */
const createUser = async (req, res) => {
  try {
    const { teamName, password } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    const cleanTeam = String(teamName || '').trim();
    if (!cleanTeam) {
      return res.status(400).json({ message: 'Team Name is required' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Password is required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must contain at least 6 characters' });
    }

    // ── Derive fields from teamName using shared normalizer ───────────────────
    const username = normalizeUsername(cleanTeam);
    if (!username) {
      return res.status(400).json({ message: 'Team Name cannot be empty or whitespace only' });
    }

    // ── Duplicate check (by normalized username OR original teamName) ─────────
    const existing = await User.findOne({
      $or: [{ username }, { teamName: cleanTeam }],
    });
    if (existing) {
      return res.status(409).json({ message: `Participant "${cleanTeam}" already exists` });
    }

    // ── Create user — pre-save hook hashes the password ───────────────────────
    const user = await User.create({
      name: cleanTeam,
      username,
      password,          // plain; User model pre-save hook hashes it
      teamName: cleanTeam,
      role: 'participant',
      isActive: true,
    });

    console.log(`[ADMIN] Participant created: username="${username}", teamName="${cleanTeam}"`);

    await saveUserBackup();

    // Return safe user object (toJSON transform strips password)
    res.status(201).json({
      message: 'Participant created successfully',
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        teamName: user.teamName,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error('[ADMIN] createUser error:', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ message: messages.join(', ') || 'Validation failed' });
    }
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Participant already exists' });
    }
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

/**
 * POST /api/admin/users/bulk
 * Bulk create participants via CSV upload
 * Expected CSV columns: teamName, password
 */
const bulkCreateUsers = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const results = [];
    const errors = [];
    const rows = [];

    const stream = Readable.from(req.file.buffer.toString());
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    // Track normalized usernames within this batch to catch intra-CSV duplicates
    const batchUsernames = new Set();

    for (const row of rows) {
      try {
        const rawTeam = (row.teamName || row.name || row.username || '').trim();
        const rawPassword = (row.password || '').trim();

        if (!rawTeam) {
          errors.push({ row, reason: 'Missing teamName' });
          continue;
        }
        if (!rawPassword) {
          errors.push({ row, reason: 'Missing password' });
          continue;
        }
        if (rawPassword.length < 6) {
          errors.push({ row, reason: 'Password must be at least 6 characters' });
          continue;
        }

        const username = normalizeUsername(rawTeam);
        if (!username) {
          errors.push({ row, reason: 'Team name resolves to empty string after normalization' });
          continue;
        }

        // Check for duplicates within this CSV batch
        if (batchUsernames.has(username)) {
          errors.push({ row, reason: `Duplicate in CSV: "${rawTeam}" normalizes to "${username}" which already appears in this file` });
          continue;
        }

        // Check against existing DB records
        const existing = await User.findOne({
          $or: [{ username }, { teamName: rawTeam }],
        });
        if (existing) {
          errors.push({ row, reason: `Team "${rawTeam}" already exists in database` });
          continue;
        }

        const user = await User.create({
          name: rawTeam,
          username,
          password: rawPassword,   // pre-save hook hashes it
          teamName: rawTeam,
          role: 'participant',
          isActive: true,
        });

        batchUsernames.add(username);
        results.push({
          username: user.username,
          name: user.name,
          teamName: user.teamName,
        });
      } catch (rowErr) {
        if (rowErr.code === 11000) {
          errors.push({ row, reason: 'Duplicate: participant already exists' });
        } else {
          errors.push({ row, reason: rowErr.message });
        }
      }
    }

    await saveUserBackup();

    res.json({ created: results.length, errors, created_users: results });
  } catch (err) {
    console.error('[ADMIN] bulkCreateUsers error:', err);
    res.status(500).json({ message: 'Server error during bulk creation' });
  }
};

/**
 * GET /api/admin/users
 * List all participants with submission status
 */
const getUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'participant' }).sort({ createdAt: -1 });
    const userIds = users.map((u) => u._id);

    const submissions = await Submission.find({ userId: { $in: userIds } }).select(
      'userId round status totalScore submittedAt'
    );

    const submissionMap = {};
    submissions.forEach((sub) => {
      if (!submissionMap[sub.userId]) submissionMap[sub.userId] = {};
      submissionMap[sub.userId][sub.round] = {
        status: sub.status,
        totalScore: sub.totalScore,
        submittedAt: sub.submittedAt,
      };
    });

    const usersWithStatus = users.map((u) => ({
      ...u.toJSON(),
      rounds: submissionMap[u._id] || {},
    }));

    res.json({ users: usersWithStatus });
  } catch (err) {
    console.error('[ADMIN] getUsers error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PATCH /api/admin/users/:id
 * Update participant: name, teamName, password reset, isActive toggle
 */
const updateUser = async (req, res) => {
  try {
    const { name, teamName, password, isActive } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'admin') {
      return res.status(404).json({ message: 'Participant not found' });
    }

    if (name !== undefined) user.name = String(name).trim();
    if (teamName !== undefined) {
      const cleanTeam = String(teamName).trim();
      user.teamName = cleanTeam;
      user.name = cleanTeam;
      // Update username to match new teamName
      user.username = normalizeUsername(cleanTeam);
    }
    if (isActive !== undefined) user.isActive = isActive;
    if (password) {
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ message: 'Password must contain at least 6 characters' });
      }
      user.password = password; // pre-save hook will hash it
    }

    await user.save();
    console.log(`[ADMIN] Participant updated: ${user._id}`);
    await saveUserBackup();

    res.json({
      message: 'User updated',
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        teamName: user.teamName,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error('[ADMIN] updateUser error:', err);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ message: messages.join(', ') || 'Validation failed' });
    }
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Team Name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * DELETE /api/admin/users/:id
 * Soft-delete (deactivate) a participant
 */
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role === 'admin') {
      return res.status(404).json({ message: 'Participant not found' });
    }
    user.isActive = false;
    await user.save();
    await saveUserBackup();
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createUser, bulkCreateUsers, getUsers, updateUser, deleteUser };
