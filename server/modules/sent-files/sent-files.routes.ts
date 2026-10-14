import express from 'express';

import { sentFilesService } from '@/modules/sent-files/sent-files.service.js';
import { AppError } from '@/shared/utils.js';

const router = express.Router();

function sendError(res: express.Response, error: unknown) {
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  res.status(statusCode).json({ success: false, error: error instanceof Error ? error.message : String(error) });
}

router.get('/:id', (req, res) => {
  try {
    res.json({ success: true, data: sentFilesService.getSentFile(req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id/content', (req, res) => {
  try {
    const sentFile = sentFilesService.getSentFile(req.params.id);
    // Served as an attachment-safe download: the app renders HTML itself in a
    // sandboxed iframe, the raw response must never run in the app origin.
    res.setHeader('Content-Type', sentFile.mimeType.startsWith('text/html') ? 'text/plain; charset=utf-8' : sentFile.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(sentFile.name)}`);
    res.sendFile(sentFilesService.getSentFileContentPath(req.params.id));
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
