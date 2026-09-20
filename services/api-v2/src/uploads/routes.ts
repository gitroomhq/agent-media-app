// Copyright 2026 agent-media contributors. Apache-2.0 license.
import express, {
  type RequestHandler,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import type { UploadService } from './service.js';
import { MAX_IMAGE_BYTES, UploadError, type UploadSession } from './types.js';
import { uploadPanelHtml } from './panel.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const token = /^[a-f0-9]{64}$/;
type SessionRequest = Request & { uploadSession?: UploadSession; userId?: string };
const run =
  (handler: (req: SessionRequest, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void handler(req, res).catch(next);
  };

/** Injected auth keeps the owner API and the restricted panel capability separate. */
export function createUploadRouter(service: UploadService, auth: RequestHandler): express.Router {
  const router = express.Router();
  let activeUploads = 0;
  const capacity: RequestHandler = (_req, res, next) => {
    if (activeUploads >= 2)
      return next(
        new UploadError(
          429,
          'UPLOAD_BUSY',
          'Uploads are busy. Wait a moment and retry the same file.',
        ),
      );
    activeUploads++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeUploads--;
      }
    };
    res.locals.releaseUpload = release;
    res.once('finish', release);
    res.once('close', () => {
      if (!res.locals.processingUpload) release();
    });
    next();
  };
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.get('/upload', (_req, res) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    res.type('html').send(uploadPanelHtml(service.apiBase));
  });
  router.post(
    '/v1/upload-sessions',
    auth,
    run(async (req, res) => {
      if (!req.userId)
        throw new UploadError(401, 'UNAUTHORIZED', 'Sign in to open an upload panel.');
      res.status(201).json(await service.create(req.userId));
    }),
  );
  router.get('/v1/upload-sessions', auth, run(async (req, res) => {
    if (!req.userId) throw new UploadError(401, 'UNAUTHORIZED', 'Sign in to find your uploads.');
    res.json(await service.recent(req.userId));
  }));
  router.get('/v1/upload-sessions/:sessionId/previews', auth, capacity, run(async (req, res) => {
    if (!req.userId) throw new UploadError(401, 'UNAUTHORIZED', 'Sign in to view your images.');
    if (!uuid.test(String(req.params.sessionId))) throw new UploadError(400, 'INVALID_INPUT', 'Invalid upload session.');
    res.locals.processingUpload = true;
    try {
      const session = await service.authorize(String(req.params.sessionId), { userId: req.userId });
      res.json(await service.previews(session));
    } finally { res.locals.releaseUpload(); }
  }));
  router.get(
    '/v1/upload-sessions/:sessionId',
    auth,
    run(async (req, res) => {
      if (!req.userId) throw new UploadError(401, 'UNAUTHORIZED', 'Sign in to view your images.');
      if (!uuid.test(String(req.params.sessionId)))
        throw new UploadError(400, 'INVALID_INPUT', 'Invalid upload session.');
      res.json(
        await service.view(
          await service.authorize(String(req.params.sessionId), { userId: req.userId }),
        ),
      );
    }),
  );
  router.use('/v1/upload-panels/:sessionId', (req: SessionRequest, res, next) => {
    const id = String(req.params.sessionId);
    const value = req.get('Authorization')?.match(/^Upload ([a-f0-9]{64})$/)?.[1];
    if (!uuid.test(id) || !value)
      return next(
        new UploadError(401, 'UPLOAD_UNAUTHORIZED', 'Open the upload link provided by your agent.'),
      );
    void service
      .authorize(id, { token: value })
      .then((session) => {
        req.uploadSession = session;
        next();
      })
      .catch(next);
  });
  router.get(
    '/v1/upload-panels/:sessionId',
    run(async (req, res) => {
      res.json(await service.view(req.uploadSession!));
    }),
  );
  router.put(
    '/v1/upload-panels/:sessionId/files/:assetId',
    capacity,
    express.raw({ type: 'application/octet-stream', limit: MAX_IMAGE_BYTES }),
    run(async (req, res) => {
      res.locals.processingUpload = true;
      try {
        if (!uuid.test(String(req.params.assetId)) || !Buffer.isBuffer(req.body))
          throw new UploadError(
            400,
            'INVALID_INPUT',
            'Send the original image file as a binary upload.',
          );
        const filename = typeof req.query.filename === 'string' ? req.query.filename : 'Image';
        res.json(
          await service.upload(req.uploadSession!, String(req.params.assetId), filename, req.body),
        );
      } finally {
        res.locals.releaseUpload();
      }
    }),
  );
  router.get(
    '/v1/uploads/temporary/:assetId/image',
    run(async (req, res) => {
      const value = typeof req.query.token === 'string' ? req.query.token : '';
      if (!uuid.test(String(req.params.assetId)) || !token.test(value))
        throw new UploadError(404, 'IMAGE_NOT_FOUND', 'Image not found.');
      const image = await service.read(String(req.params.assetId), value);
      res.type(image.mime).setHeader('Content-Disposition', 'inline');
      res.send(image.bytes);
    }),
  );
  router.use(
    (error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
      const known = error instanceof UploadError;
      const tooLarge = error.status === 413;
      res.status(known ? error.status! : tooLarge ? 413 : 503).json({
        error: {
          code: known ? error.code : tooLarge ? 'IMAGE_TOO_LARGE' : 'UPLOAD_UNAVAILABLE',
          message: known
            ? error.message
            : tooLarge
              ? 'Choose an image up to 25 MB.'
              : 'Upload interrupted. Retry the same file; completed uploads are kept.',
        },
      });
    },
  );
  return router;
}
