const app = require('../server/index.js');
const mongoose = require('mongoose');
const seed = require('../server/seed/seed.js');

let isConnected = false;
let isSeeded = false;

const DEFAULT_MONGODB_URI = 'mongodb+srv://saravansiddharth05_db_user:B.Rakesh2006@cluster0.sb0x1gy.mongodb.net/code-breakers?retryWrites=true&w=majority';

async function connectToDatabase() {
  if (isConnected || mongoose.connection.readyState >= 1) {
    isConnected = true;
    return;
  }

  const uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
  if (uri && uri !== 'memory') {
    try {
      console.log('🔄 Connecting to MongoDB in Vercel serverless function...');
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      isConnected = true;
      console.log('✅ Connected to MongoDB Atlas DB successfully in Vercel serverless function!');
    } catch (err) {
      console.error('❌ MongoDB connection error in Vercel serverless function:', err.message);
    }
  }

  if (isConnected && !isSeeded) {
    try {
      await seed();
      isSeeded = true;
    } catch (seedErr) {
      console.error('⚠️ Auto-seed error in Vercel serverless function:', seedErr.message);
    }
  }
}

module.exports = async (req, res) => {
  await connectToDatabase();
  return app(req, res);
};
