const app = require('../server/index.js');
const mongoose = require('mongoose');

let cachedConn = null;
let isSeeded = false;

async function connectToDatabase() {
  if (cachedConn && mongoose.connection.readyState >= 1) {
    return cachedConn;
  }

  const DEFAULT_ATLAS_URI = 'mongodb+srv://Anand:anand123@cluster0.bn7dvbg.mongodb.net/code-breakers?retryWrites=true&w=majority';
  const uri = process.env.MONGODB_URI || DEFAULT_ATLAS_URI;

  if (mongoose.connection.readyState === 0) {
    console.log('[VERCEL] Fast connecting to MongoDB Atlas...');
    cachedConn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    console.log('[VERCEL] Connected to MongoDB Atlas!');
  } else {
    cachedConn = mongoose.connection;
  }

  // Only run seed/restore if DB is completely empty (0 users)
  if (!isSeeded) {
    isSeeded = true;
    try {
      const User = mongoose.model('User');
      const userCount = await User.countDocuments();
      if (userCount === 0) {
        console.log('[VERCEL] Empty database detected; performing initial seed...');
        const seed = require('../server/seed/seed.js');
        await seed();
      }
    } catch (_) {
      // Ignore if user count check fails during rapid cold start
    }
  }

  return cachedConn;
}

module.exports = async (req, res) => {
  try {
    await connectToDatabase();
    return app(req, res);
  } catch (err) {
    console.error('[VERCEL] Connection error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server/database connection failed',
    });
  }
};