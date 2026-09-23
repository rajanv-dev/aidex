require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const participantRoutes = require('./routes/participantRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const { apiLimiter } = require('./middleware/rateLimiter');

const seed = require('./seed/seed');

const app = express();

// ─── Security & Logging ──────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan('dev'));

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5000',
  'http://localhost:3000',
  'https://aidex-code-breaker.vercel.app',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── General Rate Limit ──────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rounds', participantRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// 404 fallback
app.use((req, res) => res.status(404).json({ message: `Route ${req.method} ${req.path} not found` }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// ─── Database & Server ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const connectDB = async () => {
  let connected = false;
  
  if (process.env.MONGODB_URI && process.env.MONGODB_URI !== 'memory') {
    try {
      console.log('🔄 Connecting to MongoDB:', process.env.MONGODB_URI);
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      console.log('✅ Connected to MongoDB Atlas DB successfully!');
      connected = true;
    } catch (err) {
      console.warn('⚠️  Failed to connect to primary MONGODB_URI:', err.message);
      console.warn('👉 Note: IP access whitelist or connection string issue detected on MongoDB Atlas.');
    }
  }

  if (!connected) {
    try {
      const path = require('path');
      const fs = require('fs');
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      } else {
        const lockFile = path.join(dataDir, 'mongod.lock');
        if (fs.existsSync(lockFile)) {
          try {
            fs.unlinkSync(lockFile);
          } catch (_) {}
        }
      }

      console.log('💾 Starting persistent local database storage at:', dataDir);
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create({
        instance: {
          dbPath: dataDir,
          storageEngine: 'wiredTiger',
          keepData: true,
          dbName: 'code-breakers',
        },
      });
      const uri = mongod.getUri('code-breakers');
      await mongoose.connect(uri);
      console.log('✅ Connected to Local Persistent MongoDB at', uri);
    } catch (err) {
      console.error('❌ Failed to start Local Database:', err.message);
      process.exit(1);
    }
  }

  // Auto-seed initial data if not present
  try {
    await seed();
  } catch (seedErr) {
    console.error('⚠️  Auto-seed error:', seedErr.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Code Breakers Backend Server running on port ${PORT}`);
    console.log(`🔑 Default Admin: username=admin / password=CodeBreaker123\n`);
  });
};

if (require.main === module) {
  connectDB();
}

module.exports = app;
