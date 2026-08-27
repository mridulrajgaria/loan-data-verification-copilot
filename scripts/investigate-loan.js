const fs = require('fs');
const path = require('path');
const prisma = require('../backend/src/db');

async function investigate() {
  console.log('🔍 Investigating Loan LN-0100077 and Verified Loans Export...');

  // 1. Search in DB for loanIdentifier = 'LN-0100077'
  const loan = await prisma.normalizedLoan.findFirst({
    where: { loanIdentifier: 'LN-0100077' },
    include: {
      rawLoanRecord: true,
      rawUpload: true,
      exceptions: {
        include: { rule: true, reviewActions: true, aiRecommendations: true },
      },
      reviewActions: {
        include: { user: true, aiRecommendation: true },
      },
      verifiedLoan: true,
    },
  });

  console.log('\n--- 1. Database NormalizedLoan Record ---');
  if (!loan) {
    console.log('Loan LN-0100077 not found in SQLite DB.');
  } else {
    console.log({
      id: loan.id,
      loanIdentifier: loan.loanIdentifier,
      originationDate: loan.originationDate,
      maturityDate: loan.maturityDate,
      originalPrincipal: loan.originalPrincipal,
      currentBalance: loan.currentBalance,
      status: loan.status,
      currentVersion: loan.currentVersion,
      rawUnparsedValues: loan.rawUnparsedValues,
      verifiedLoan: loan.verifiedLoan,
    });

    console.log('\n--- 2. Exceptions for LN-0100077 ---');
    loan.exceptions.forEach((e) => {
      console.log({
        id: e.id,
        ruleCode: e.rule.ruleCode,
        severity: e.severity,
        status: e.status,
        resolution: e.resolution,
        details: e.details,
        resolvedAt: e.resolvedAt,
      });
    });

    console.log('\n--- 3. ReviewActions for LN-0100077 ---');
    loan.reviewActions.forEach((ra) => {
      console.log({
        id: ra.id,
        actionType: ra.actionType,
        resolution: ra.resolution,
        notes: ra.notes,
        beforeState: ra.beforeState,
        afterState: ra.afterState,
        aiRecommendationId: ra.aiRecommendationId,
        createdAt: ra.createdAt,
      });
    });

    console.log('\n--- 4. AuditLogs for LN-0100077 ---');
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: loan.id },
          { entityId: { in: loan.exceptions.map((e) => e.id) } },
          { entityId: loan.verifiedLoan ? loan.verifiedLoan.id : 'none' },
        ],
      },
      orderBy: { timestamp: 'asc' },
    });
    logs.forEach((l) => {
      console.log({
        actionType: l.actionType,
        actor: l.actor,
        entityType: l.entityType,
        entityId: l.entityId,
        details: l.details,
        timestamp: l.timestamp,
      });
    });
  }

  // 2. Check sample-output/verified-loans-export.json
  const exportPath = path.join(__dirname, '..', 'sample-output', 'verified-loans-export.json');
  if (fs.existsSync(exportPath)) {
    const rawExport = fs.readFileSync(exportPath, 'utf8');
    const exportData = JSON.parse(rawExport);
    console.log(`\n--- 5. Export File Overview ---`);
    console.log(`Total verified loans in export: ${exportData.verifiedLoans?.length || exportData.totalVerifiedLoans || exportData.length}`);

    const targetInExport = (exportData.verifiedLoans || exportData).find(
      (v) => v.verifiedLoanId === '4dab6894-cd16-4880-8125-3a16a974df6a' || v.canonicalPayload?.canonicalLoan?.loanIdentifier === 'LN-0100077'
    );

    console.log('\n--- Target in Export ---');
    console.log(JSON.stringify(targetInExport, null, 2));
  }

  await prisma.$disconnect();
}

investigate().catch(console.error);
