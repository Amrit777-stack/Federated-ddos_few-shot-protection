const express = require('express');
const cors = require('cors');
const dataService = require('./services/dataService');

const overviewRouter = require('./routes/overview');
const enterprisesRouter = require('./routes/enterprises');
const fewShotRouter = require('./routes/fewShot');
const researchRouter = require('./routes/research');
const alertsRouter = require('./routes/alerts');
const detectionRouter = require('./routes/detection');
const liveRouter = require('./routes/live');

const app = express();
const PREFERRED_PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[API] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Diagnostic & Root Route
app.get('/', (req, res) => {
  res.json({
    service: 'SENTINEL-FL Backend API',
    status: 'ONLINE',
    version: '1.0.0',
    documentation: '/api/health',
    endpoints: [
      '/api/overview',
      '/api/enterprises',
      '/api/few-shot',
      '/api/research',
      '/api/alerts',
      '/api/detection',
      '/api/live'
    ]
  });
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version
  });
});

// Mount Routes
app.use('/api/overview', overviewRouter);
app.use('/api/enterprises', enterprisesRouter);
app.use('/api/few-shot', fewShotRouter);
app.use('/api/research', researchRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/detection', detectionRouter);
app.use('/api/live', liveRouter);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `API endpoint '${req.originalUrl}' does not exist.`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[API Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start Server with automatic candidate port fallback
function startServer(portIndex = 0) {
  const candidatePorts = [
    parseInt(PREFERRED_PORT, 10) || 5000,
    5001,
    5050,
    3001
  ];
  if (portIndex >= candidatePorts.length) {
    console.error('All candidate ports in use. Could not start server.');
    process.exit(1);
  }
  const currentPort = candidatePorts[portIndex];
  const server = app.listen(currentPort, () => {
    console.log('====================================================');
    console.log(`  SENTINEL-FL Backend API running on port ${currentPort}`);
    console.log(`  Health Check: http://localhost:${currentPort}/api/health`);
    console.log('====================================================');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
      console.warn(`[Server] Port ${currentPort} unavailable (${err.code}). Trying next port...`);
      startServer(portIndex + 1);
    } else {
      console.error('[Server Error]', err);
    }
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
