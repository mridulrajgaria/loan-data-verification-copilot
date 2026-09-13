require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const prisma = require('./db');
const { processLoanTapeUpload } = require('./services/ingestionService');
const { createVerifiedLoanRecord } = require('./services/verificationService');
const { authenticateUser } = require('./middleware/auth');
const uploadRoutes = require('./routes/uploadRoutes');
const exceptionRoutes = require('./routes/exceptionRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

// Automatic self-healing bootstrap: if database is empty on server startup (e.g. after Render free tier sleep/restart), auto-seed the initial tape
async function autoSeedIfEmpty() {
  try {
    const loanCount = await prisma.normalizedLoan.count();
    if (loanCount > 0) return;

    console.log('🔄 [BOOTSTRAP] Fresh/empty database detected. Auto-seeding initial 2,000-loan tape...');
    const candidatePaths = [
      path.resolve(__dirname, '../data/loan_tape.csv'),
      path.resolve(__dirname, '../../data/loan_tape.csv'),
      path.resolve(process.cwd(), 'data/loan_tape.csv'),
      path.resolve(process.cwd(), '../data/loan_tape.csv'),
    ];

    const tapePath = candidatePaths.find((p) => fs.existsSync(p));
    if (!tapePath) {
      console.warn('⚠️ [BOOTSTRAP] loan_tape.csv not found in candidate paths.');
      return;
    }

    const fileBuffer = fs.readFileSync(tapePath);
    const filename = path.basename(tapePath);

    await processLoanTapeUpload({
      fileBuffer,
      filename,
      userId: 'usr-operator-01',
    });
    console.log('✅ [BOOTSTRAP] Portfolio tape successfully auto-seeded on boot!');

    // Automatically seal 50 clean loans into the Verified Records Ledger
    const cleanLoans = await prisma.normalizedLoan.findMany({
      where: { status: 'VALID' },
      take: 50,
    });
    for (const loan of cleanLoans) {
      await createVerifiedLoanRecord({
        loanId: loan.id,
        userId: 'usr-reviewer-01',
        reviewerNote: 'Pre-issuance quality control verification completed. Cryptographic seal applied.',
      });
    }
    console.log(`✅ [BOOTSTRAP] Cryptographically sealed ${cleanLoans.length} loans into Verified Records Ledger!`);
  } catch (err) {
    console.error('❌ [BOOTSTRAP] Failed to auto-seed on boot:', err.message);
  }
}

// Security & Parsing Middlewares
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) or wildcard or matching frontend
    if (!origin || allowedOrigin === '*' || origin === allowedOrigin || origin === 'http://localhost:5173') {
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
    autoSeedIfEmpty();
  });
}

module.exports = app;
