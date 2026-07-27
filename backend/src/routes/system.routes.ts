import { Router, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import { authenticate, AuthenticatedRequest, requireOwner } from '../middlewares/auth.middleware';

const router = Router();

// Self-update shells out to git, so it is only meaningful for the on-premise desktop install.
// It stays disabled unless explicitly opted in, and is never available on a hosted deployment.
const selfUpdateEnabled =
  process.env.ALLOW_SELF_UPDATE === 'true' && process.env.NODE_ENV !== 'production';

// GET /api/system/check-update — Check if new commits exist on GitHub repository
router.get('/check-update', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (!selfUpdateEnabled) {
    return res.json({ hasUpdate: false, updatesDisabled: true });
  }
  try {
    // 1. Get current local commit hash
    exec('git rev-parse HEAD', { cwd: path.join(__dirname, '../../..') }, async (err, stdout) => {
      if (err) {
        return res.json({ hasUpdate: false, currentVersion: 'v1.0.0' });
      }
      const localHash = stdout.trim();

      try {
        // 2. Fetch latest commit from GitHub API for adgenpharmacy/adgen-erp
        const githubRes = await fetch('https://api.github.com/repos/adgenpharmacy/adgen-erp/commits/main', {
          headers: { 'User-Agent': 'AdGen-ERP-App' },
        });

        if (!githubRes.ok) {
          return res.json({ hasUpdate: false, currentHash: localHash.slice(0, 7) });
        }

        const remoteData: any = await githubRes.json();
        const remoteHash = remoteData.sha;
        const commitMsg = remoteData.commit?.message || 'New ERP updates and bug fixes available';
        const commitDate = remoteData.commit?.author?.date;

        const hasUpdate = Boolean(remoteHash && remoteHash !== localHash);

        res.json({
          hasUpdate,
          currentHash: localHash.slice(0, 7),
          latestHash: remoteHash ? remoteHash.slice(0, 7) : '',
          latestCommitMsg: commitMsg,
          latestCommitDate: commitDate,
        });
      } catch (e) {
        res.json({ hasUpdate: false, currentHash: localHash.slice(0, 7) });
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/system/apply-update — Trigger git pull origin main to auto-update
router.post('/apply-update', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!selfUpdateEnabled) {
      return res.status(403).json({ error: 'Self-update is disabled on this deployment.' });
    }
    const projectRoot = path.join(__dirname, '../../..');
    exec('git pull origin main', { cwd: projectRoot }, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({ error: 'Git pull failed: ' + err.message });
      }
      res.json({
        message: 'Update downloaded successfully from GitHub!',
        output: stdout,
      });
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/system/export-data — Secure Full Database JSON Export
router.get('/export-data', authenticate, requireOwner, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prisma } = await import('../config/prisma');

    const [parties, products, inventoryBatches, purchaseBills, salesBills, customers, ledgerEntries] = await Promise.all([
      prisma.party.findMany(),
      prisma.product.findMany(),
      prisma.inventoryBatch.findMany({ include: { product: true } }),
      prisma.purchaseBill.findMany({ include: { party: true, items: { include: { product: true } } } }),
      prisma.salesBill.findMany({ include: { customer: true, items: { include: { product: true, batch: true } } } }),
      prisma.customer.findMany(),
      prisma.ledgerEntry.findMany(),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user?.email || 'Authenticated User',
      system: 'AdGen Pharmacy ERP Engine',
      version: '1.0.0',
      recordCounts: {
        parties: parties.length,
        products: products.length,
        inventoryBatches: inventoryBatches.length,
        purchaseBills: purchaseBills.length,
        salesBills: salesBills.length,
        customers: customers.length,
        ledgerEntries: ledgerEntries.length,
      },
      data: {
        parties,
        products,
        inventoryBatches,
        purchaseBills,
        salesBills,
        customers,
        ledgerEntries,
      },
    };

    const fileName = `AdGen_Pharmacy_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(exportPayload, null, 2));
  } catch (e: any) {
    res.status(500).json({ error: 'Export failed: ' + e.message });
  }
});

export default router;
