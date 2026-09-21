const app = require('../server/index.js');
const mongoose = require('mongoose');

let isConnected = false;

async function connectToDatabase() {
  if (isConnected || mongoose.connection.readyState >= 1) {
    isConnected = true;
    return;
  }
  if (process.env.MONGODB_URI && process.env.MONGODB_URI !== 'memory') {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      isConnected = true;
    } catch (err) {
      console.error('MongoDB connection error in serverless function:', err.message);
    }
  }
}

module.exports = async (req, res) => {
  await connectToDatabase();
  return app(req, res);
};
