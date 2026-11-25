import express from 'express';
import crypto from 'node:crypto';
import { loadConfig } from './config.js';
import { AppError, NotFoundError } from './errors.js';
import { MatchRepository } from './repository/MatchRepository.js';
import { BetRepository } from './repository/BetRepository.js';
import { MatchService } from './service/MatchService.js';
import { BetService } from './service/BetService.js';
import { createMatchRouter } from './routes/MatchRoutes.js';
import { createBetRouter } from './routes/betRoutes.js';

export function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  const app = express();

  const logger = {
    info: (msg) => console.log(`${new Date().toISOString()} INFO ${msg}`),
    error: (msg, err) => console.error(`${new Date().toISOString()} ERROR ${msg}`, err || ''),
  };

  // 1. Wire dependencies in one central place
  const matchRepo = new MatchRepository();
  const betRepo = new BetRepository();
  const matchService = new MatchService(matchRepo, logger, betRepo);
  const betService = new BetService(betRepo, matchRepo, config, logger);

  // Parse incoming JSON bodies
  app.use(express.json());

  // 2. Request ID + HTTP Access Logging Middleware
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomBytes(6).toString('hex');
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    res.on('finish', () => {
      logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} [${requestId}]`);
    });
    next();
  });

  // 3. Mount Routes
  app.use('/matches', createMatchRouter(matchService));
  app.use('/bets', createBetRouter(betService));

  // Catch unknown URLs -> 404 NotFoundError
  app.use((req, res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} does not exist.`));
  });

  // 4. Centralized RFC 9457 Error Handler
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      const problem = {
        type: err.type,
        title: err.title,
        status: err.status,
        detail: err.detail,
        requestId: req.requestId,
      };
      if (err.errors) problem.errors = err.errors;
      return res.status(err.status).type('application/problem+json').json(problem);
    }

    // Unexpected crash: log full stack trace on server, send safe 500 to client
    logger.error(`Unhandled error [${req.requestId}]`, err);
    return res.status(500).type('application/problem+json').json({
      type: '/problems/internal-error',
      title: 'Internal server error',
      status: 500,
      detail: 'An unexpected error occurred.',
      requestId: req.requestId,
    });
  });

  return app;
}