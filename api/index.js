const app = require('../server/index.js');
const mongoose = require('mongoose');
const seed = require('../server/seed/seed.js');

let isConnected = false;
let isSeeded = false;

async function connectToDatabase() {
  if (isConnected || mongoose.connection.readyState >= 1) {
    isConnected = true;
  } else if (process.env.MONGODB_URI && process.env.MONGODB_URI !== 'memory') {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      isConnected = true;
      console.log('✅ Connected to MongoDB Atlas in serverless function!');
    } catch (err) {
      console.error('MongoDB connection error in serverless function:', err.message);
    }
  }

  if (isConnected && !isSeeded) {
    try {
      await seed();
      isSeeded = true;
    } catch (seedErr) {
      console.error('Auto-seed error in serverless function:', seedErr.message);
    }
  }
}

module.exports = async (req, res) => {
  await connectToDatabase();
  return app(req, res);
};
