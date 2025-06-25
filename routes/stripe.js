import express from 'express';
import { reconcileStripePayments } from '../utils/cron_stripe_reconcile.js';

const router = express.Router();

// POST /api/stripe/reconcile-now
router.post('/reconcile-now', async (req, res) => {
  try {
    await reconcileStripePayments();
    res.json({ success: true, message: 'Stripe reconciliation completed.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || error.toString() });
  }
});

export default router;
