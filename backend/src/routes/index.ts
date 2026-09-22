import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';
import * as cmsController from '../controllers/cmsController.js';
import * as mlController from '../controllers/mlController.js';
import * as tradingController from '../controllers/tradingController.js';
import * as marketController from '../controllers/marketController.js';
import * as coachController from '../controllers/coachController.js';

const router = Router();

// Auth
router.post('/auth/sign-in', authController.signIn);
router.post('/auth/sign-up', authController.signUp);
router.get('/auth/profile', authMiddleware, authController.getProfile);
router.get('/auth/profiles', authMiddleware, adminMiddleware, authController.getAllProfiles);
router.put('/auth/profiles/role', authMiddleware, adminMiddleware, authController.updateProfileRole);

// CMS
router.get('/cms/published', cmsController.fetchPublished);
router.get('/cms/by-slug/:slug', cmsController.fetchBySlug);
router.get('/cms/all', authMiddleware, adminMiddleware, cmsController.fetchAll);
router.put('/cms/upsert', authMiddleware, adminMiddleware, cmsController.upsert);
router.delete('/cms/:id', authMiddleware, adminMiddleware, cmsController.remove);
router.put('/cms/:id/publish', authMiddleware, adminMiddleware, cmsController.togglePublish);

// ML
router.get('/ml/prediction', mlController.getCachedPrediction);
router.post('/ml/predict', mlController.predict);
router.get('/ml/versions', authMiddleware, adminMiddleware, mlController.getModelVersions);

// Trading
router.get('/trading/positions', authMiddleware, tradingController.getPositions);
router.post('/trading/positions', authMiddleware, tradingController.createPosition);
router.put('/trading/positions/:id/close', authMiddleware, tradingController.closePosition);
router.get('/trading/trades', authMiddleware, tradingController.getTrades);

// Metrics
router.get('/metrics', authMiddleware, adminMiddleware, tradingController.getMetrics);

// Market data
router.get('/markets/klines', marketController.getKlines);

// Coach
router.post('/coach/ask', coachController.ask);

export default router;
