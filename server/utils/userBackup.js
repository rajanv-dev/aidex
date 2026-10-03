const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BACKUP_PATHS = [
  path.join(__dirname, '../data/users_backup.json'),
  path.join(__dirname, '../users_backup.json'),
  path.join(__dirname, '../../users_backup.json'),
];

/**
 * Save all participant accounts (and admin accounts) to JSON backup files
 */
const saveUserBackup = async () => {
  try {
    const User = mongoose.model('User');
    const users = await User.find({}).lean();

    if (!users || users.length === 0) {
      console.log('ℹ [BACKUP] No users in database to backup; preserving existing backup files.');
      return;
    }

    const backupData = users.map((u) => ({
      _id: u._id.toString(),
      name: u.name,
      username: u.username,
      password: u.password, // hashed password
      role: u.role,
      teamName: u.teamName,
      isActive: u.isActive !== undefined ? u.isActive : true,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
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
        // Continue to next path if file system is read-only
      }
    }

    if (savedAny) {
      console.log(` [BACKUP] Saved ${backupData.length} users to backup JSON file.`);
    }
  } catch (err) {
    console.error(' [BACKUP] Failed to save users backup:', err.message);
  }
};

/**
 * Restore users from JSON backup files into MongoDB database if missing
 */
const restoreUserBackup = async () => {
  try {
    const User = mongoose.model('User');
    let restoredCount = 0;
    let backupUsers = [];

    for (const fileLoc of BACKUP_PATHS) {
      try {
        if (fs.existsSync(fileLoc)) {
          const content = fs.readFileSync(fileLoc, 'utf-8');
          if (content && content.trim()) {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed) && parsed.length > 0) {
              backupUsers = parsed;
              break; // Found valid backup file
            }
          }
        }
      } catch (_) {
        // Try next location
      }
    }

    if (backupUsers.length === 0) return;

    for (const uData of backupUsers) {
      if (!uData.username) continue;
      try {
        const existing = await User.findOne({
          $or: [{ username: uData.username }, { _id: uData._id }],
        });
        if (!existing) {
          const userDoc = {
            _id: new mongoose.Types.ObjectId(uData._id),
            name: uData.name || uData.teamName || uData.username,
            username: uData.username,
            password: uData.password, // already hashed
            role: uData.role || 'participant',
            teamName: uData.teamName || uData.name || '',
            isActive: uData.isActive !== undefined ? uData.isActive : true,
            createdAt: uData.createdAt ? new Date(uData.createdAt) : new Date(),
            updatedAt: uData.updatedAt ? new Date(uData.updatedAt) : new Date(),
          };

          await User.collection.insertOne(userDoc);
          restoredCount++;
        }
      } catch (userErr) {
        console.warn(` [BACKUP] Skip single user restore for "${uData.username}":`, userErr.message);
      }
    }

    if (restoredCount > 0) {
      console.log(` [BACKUP] Restored ${restoredCount} user(s) from JSON backup into database.`);
    }
  } catch (err) {
    console.error(' [BACKUP] Failed to restore users from backup:', err.message);
  }
};

module.exports = { saveUserBackup, restoreUserBackup };

