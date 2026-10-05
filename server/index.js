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

const seed = require('./seed/seed'); // Auto-seed configuration

const app = express();

// Trust reverse proxy headers (Vercel, Render, Nginx)
app.set('trust proxy', 1);

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
  'https://aidex-code-breakers.vercel.app',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin) || /\.onrender\.com$/.test(origin)) {
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

const path = require('path');
const fs = require('fs');

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// ─── Serve Static Frontend Assets & SPA Fallback ──────────────────────────────
const rootDistPath = path.join(__dirname, '../dist');
const clientDistPath = path.join(__dirname, '../client/dist');
const staticPath = fs.existsSync(rootDistPath)
  ? rootDistPath
  : fs.existsSync(clientDistPath)
  ? clientDistPath
  : null;

if (staticPath) {
  console.log(' Serving static frontend files from:', staticPath);
  app.use(express.static(staticPath));

  // SPA fallback for all client routes (e.g. /round/1, /admin/users, /final-result)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

// 404 fallback for unmatched API routes
app.use('/api/*', (req, res) => res.status(404).json({ message: `API Route ${req.method} ${req.path} not found` }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// ─── Database & Server ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

mongoose.connection.on('disconnected', () => {
  console.warn('  MongoDB disconnected. Mongoose will attempt auto-reconnect...');
});
mongoose.connection.on('reconnected', () => {
  console.log('  MongoDB reconnected successfully!');
});
mongoose.connection.on('error', (err) => {
  console.error('  MongoDB connection error:', err.message);
});

// Store top-level reference to prevent MongoMemoryServer instance from being garbage collected
let mongoMemoryServerInstance = null;

const connectDB = async () => {
  let connected = false;
  
  const DEFAULT_ATLAS_URI = 'mongodb+srv://Anand:anand123@cluster0.bn7dvbg.mongodb.net/code-breakers?retryWrites=true&w=majority';
  const mongoUri = process.env.MONGODB_URI || DEFAULT_ATLAS_URI;
  
  if (mongoUri && mongoUri !== 'memory') {
    try {
      console.log(' Connecting to MongoDB Atlas DB...');
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      console.log(' Connected to MongoDB Atlas DB successfully!');
      connected = true;
    } catch (err) {
      console.warn('  Failed to connect to primary MONGODB_URI:', err.message);
      console.warn(' Note: Check IP access whitelist (0.0.0.0/0) or connection string in MongoDB Atlas.');
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

      console.log(' Starting persistent local database storage at:', dataDir);
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mongoMemoryServerInstance = await MongoMemoryServer.create({
        instance: {
          dbPath: dataDir,
          storageEngine: 'wiredTiger',
          keepData: true,
          dbName: 'code-breakers',
        },
      });
      const uri = mongoMemoryServerInstance.getUri('code-breakers');
      await mongoose.connect(uri);
      console.log(' Connected to Local Persistent MongoDB at', uri);
    } catch (err) {
      console.error(' Failed to start Local Database:', err.message);
      process.exit(1);
    }
  }

  // Auto-seed initial data if not present
  try {
    await seed();
  } catch (seedErr) {
    console.error('  Auto-seed error:', seedErr.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n Code Breakers Backend Server running on port ${PORT}`);
    console.log(` Default Admin: username=admin / password=CodeBreaker123\n`);
  });
};

if (require.main === module) {
  connectDB();
}

module.exports = app;
// Trigger nodemon restart to reseed DB with updated corrected code

