import express from 'express';
import type { Request, Response } from 'express';

import { planUsageService } from '@/modules/plan-usage/plan-usage.service.js';
import { asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';

type PlanUsageService = Pick<typeof planUsageService, 'getState' | 'refresh' | 'refreshIfStale'>;

/** Built from a service so tests can drive the routes without the SDK. */
export function createPlanUsageRouter(service: PlanUsageService = planUsageService) {
  const router = express.Router();

  router.get('/', (_req: Request, res: Response) => {
    // Answers from the cache at once; a stale cache refreshes in the
    // background and the result reaches every client as a `plan_usage` event.
    service.refreshIfStale();
    res.json(createApiSuccessResponse(service.getState()));
  });

  router.post(
    '/refresh',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(createApiSuccessResponse(await service.refresh()));
    }),
  );

  return router;
}

export default createPlanUsageRouter();
