import { Router } from 'express';
import { ApiResponse } from '@splitex/shared';

const router: Router = Router();

// Placeholder routes - will be implemented in later phases
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: { message: 'Settlements list endpoint - coming soon' }
  } as ApiResponse);
});

router.post('/', (req, res) => {
  res.json({
    success: true,
    data: { message: 'Create settlement endpoint - coming soon' }
  } as ApiResponse);
});

export { router as settlementRoutes };
