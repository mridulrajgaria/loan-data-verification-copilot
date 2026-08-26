require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { authenticateUser } = require('./middleware/auth');
const uploadRoutes = require('./routes/uploadRoutes');
const exceptionRoutes = require('./routes/exceptionRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

// Security & Parsing Middlewares
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) or matching frontend
    if (!origin || origin === allowedOrigin || origin === 'http://localhost:5173') {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Global Authentication Context
app.use(authenticateUser);

// Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Loan Data Verification Copilot API',
    environment: process.env.NODE_ENV || 'development',
  });
});

// Register Module Routes
app.use('/api/uploads', uploadRoutes);
app.use('/api/exceptions', exceptionRoutes);
app.use('/api', verificationRoutes);
app.use('/api', dashboardRoutes);

// Global 404 Fallback
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Error Handling Middleware (Never leak stack traces, internal paths, or DB errors)
app.use((err, req, res, next) => {
  // Detailed diagnostic logging on the server only
  console.error('[SERVER_ERROR_SHIELD]', {
    method: req.method,
    url: req.originalUrl,
    errorName: err.name,
    message: err.message,
    stack: err.stack,
  });

  // Client receives safe, generic message
  const statusCode = err.status || err.statusCode || (err.message?.includes('CORS') ? 403 : 500);
  const clientMessage = statusCode === 403 || statusCode === 400 || statusCode === 404 || statusCode === 413 || statusCode === 429
    ? err.message
    : 'An unexpected internal error occurred. The incident has been securely logged.';

  res.status(statusCode).json({
    success: false,
    error: clientMessage,
  });
});

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Loan Data Verification Backend listening on port ${PORT}`);
    console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🛡️  Security Shields: Zod Validation, RBAC Auth, Rate Limiter & Error Obfuscation Active`);
  });
}

module.exports = app;
