const app = require('../server/index.js');
const mongoose = require('mongoose');
const seed = require('../server/seed/seed.js');
const { restoreUserBackup } = require('../server/utils/userBackup.js');
const { restoreSubmissionBackup } = require('../server/utils/submissionBackup.js');

let isConnected = false;
let isSeeded = false;

async function connectToDatabase() {
  if (isConnected && mongoose.connection.readyState >= 1) {
    return;
  }

  const DEFAULT_ATLAS_URI = 'mongodb+srv://Anand:anand123@cluster0.bn7dvbg.mongodb.net/code-breakers?retryWrites=true&w=majority';
  const uri = process.env.MONGODB_URI || DEFAULT_ATLAS_URI;

  if (mongoose.connection.readyState >= 1) {
    isConnected = true;
    return;
  }

  try {
    console.log('Connecting to MongoDB Atlas in Vercel...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('Connected to MongoDB Atlas successfully in Vercel!');
  } catch (err) {
    console.error('MongoDB Atlas connection failed in Vercel:', err.message);
    throw new Error(`Database connection failed: ${err.message}. Please ensure MongoDB Atlas Network Access has 0.0.0.0/0 (Allow from anywhere) enabled.`);
  }

  if (!isSeeded) {
    try {
      await restoreUserBackup();
      await restoreSubmissionBackup();
      await seed();
      isSeeded = true;
      console.log('Database restore & seed completed successfully.');
    } catch (seedErr) {
      console.error('Auto-seed / restore error:', seedErr.message);
    }
  }
}

module.exports = async (req, res) => {
  try {
    await connectToDatabase();
    return app(req, res);
  } catch (err) {
    console.error('API initialization error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server/database connection failed',
    });
  }
};