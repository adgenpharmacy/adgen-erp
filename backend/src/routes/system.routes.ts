import { Router, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// GET /api/system/check-update — Check if new commits exist on GitHub repository
router.get('/check-update', async (req, res: Response) => {
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
router.post('/apply-update', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
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

export default router;
