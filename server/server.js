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
const PORT = process.env.PORT || 5000;

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
    console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Root / Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'SENTINEL-FL',
    version: '1.0.0',
    mode: 'RESEARCH MODE',
    environment: 'SIMULATED ENTERPRISE ENVIRONMENT',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Global Round History direct endpoint
app.get('/api/round-history', (req, res) => {
  try {
    const history = dataService.getRoundHistory();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve round history', message: err.message });
  }
});

// Mount Routes
app.use('/api/overview', overviewRouter);
app.use('/api/enterprises', enterprisesRouter);
app.use('/api/few-shot', fewShotRouter);
app.use('/api/research', researchRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/detection', detectionRouter);
app.use('/api/live', liveRouter);

// Serve static frontend bundle in production if available
const path = require('path');
const fs = require('fs');
const distPath = path.join(__dirname, '..', 'frontend', 'dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    requestedUrl: req.originalUrl,
    availableEndpoints: [
      '/api/health',
      '/api/overview',
      '/api/enterprises',
      '/api/few-shot',
      '/api/few-shot/:attack',
      '/api/few-shot/summary',
      '/api/research',
      '/api/alerts',
      '/api/round-history',
      '/api/detection/demo'
    ]
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

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`  SENTINEL-FL Backend API running on port ${PORT}`);
    console.log(`  Health Check: http://localhost:${PORT}/api/health`);
    console.log('====================================================');
  });
}

module.exports = app;
