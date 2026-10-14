import express from 'express';

import { sentFilesService } from '@/modules/sent-files/sent-files.service.js';
import { AppError } from '@/shared/utils.js';

const router = express.Router();

function readBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(\S.*)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

router.use((req, res, next) => {
  const token = readBearerToken(req.headers.authorization);
  if (!token || token !== sentFilesService.getMcpToken()) {
    res.status(401).json({ success: false, error: 'Invalid send-file MCP token.' });
    return;
  }
  next();
});

router.post('/send', (req, res) => {
  try {
    const input = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const files = sentFilesService.sendFiles({
      paths: Array.isArray(input.files) ? input.files as string[] : [],
      caption: typeof input.caption === 'string' ? input.caption : null,
      notify: input.notify === true,
    });
    res.json({ success: true, data: { files } });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
