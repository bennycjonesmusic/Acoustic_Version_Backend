import express from 'express';
import { 
  createCommissionRequest, 
  approveCommissionAndPayout, 
  processExpiredCommissions,
  testProcessExpiredCommissions,
  createTestExpiredCommission,
  makeAllCommissionsExpired,
  uploadFinishedTrack,
  confirmOrDenyCommission,
  refundCommission,
  refundTrackPurchase,
  artistRespondToCommission,
  getArtistCommissions,
  getCustomerCommissions,
  approveOrDenyCommission,
  getCommissionPreviewForClient,
  getFinishedCommission,
  cancelCommission,
  getCommissionById
} from '../controllers/commissionControl.js';
import { downloadCommissionFile } from '../controllers/commissionDownloadController.js';
import authMiddleware from '../middleware/customer_auth.js';
import artistOrAdminAuthMiddleware from '../middleware/artist_auth.js';
import isAdmin from '../middleware/Admin.js';
import upload from '../middleware/song_upload.js';

const router = express.Router();

// Create a new commission request (customer only)
router.post('/request', authMiddleware, createCommissionRequest);

// Approve commission and pay out artist (customer or admin)
router.post('/approve', authMiddleware, approveCommissionAndPayout);
router.post('/admin/approve', authMiddleware, isAdmin, approveCommissionAndPayout);

// Approve commission and pay out artist (customer or admin, explicit endpoint for test script)
router.post('/approve-and-payout', authMiddleware, approveCommissionAndPayout);

// Process expired commissions and refund (admin only, can be called by cron or manually)
router.post('/process-expired', authMiddleware, isAdmin, processExpiredCommissions);

// TEST ROUTE: Manually trigger commission expiry processing (development/testing only)
router.post('/test/process-expired', testProcessExpiredCommissions);

// TEST ROUTE: Create a test expired commission for testing refund logic
router.post('/test/create-expired', createTestExpiredCommission);

// TEST ROUTE: Make all active commissions appear expired for testing
router.post('/test/expire-all', makeAllCommissionsExpired);

// Artist uploads finished track for commission (audio file)
router.post('/upload-finished', authMiddleware, upload.single('file'), uploadFinishedTrack);

// Customer confirms or denies preview
router.post('/confirm', authMiddleware, confirmOrDenyCommission);

// Download finished or preview commission file (customer or admin only)
router.get('/download', authMiddleware, downloadCommissionFile);

// Admin-only: Issue a refund for a regular track purchase (not commission)
router.post('/admin/track-refund', authMiddleware, isAdmin, refundTrackPurchase);

// Admin-only: Issue a refund for a commission
router.post('/admin/refund', authMiddleware, isAdmin, refundCommission);

// Artist or admin accepts or rejects a commission
router.post('/artist/respond', artistOrAdminAuthMiddleware, artistRespondToCommission);

// Get all commissions for the logged-in artist or admin
router.get('/artist/commissions', artistOrAdminAuthMiddleware, getArtistCommissions);

// Artist or admin approves or denies a commission (new, explicit route)
router.post('/artist/approve-deny', artistOrAdminAuthMiddleware, approveOrDenyCommission);

// Get all commissions for the logged-in customer (secure)
router.get('/customer/commissions', authMiddleware, getCustomerCommissions);

// Get preview for client
router.get('/preview-for-client', authMiddleware, getCommissionPreviewForClient);
// Get finished commission (adds to purchasedTracks)
router.get('/finished-commission', authMiddleware, getFinishedCommission);

// Customer cancels a commission (with reason, before delivery/payout)
router.post('/cancel', authMiddleware, cancelCommission);

// Customer pays for commission after artist accepts (returns Stripe Checkout session)
router.post('/pay', authMiddleware, async (req, res) => {
  const { commissionId } = req.body;
  console.log('[COMMISSION PAY] /commission/pay called with commissionId:', commissionId);
  if (!commissionId) return res.status(400).json({ error: 'Missing commissionId' });
  try {
    const CommissionRequest = (await import('../models/CommissionRequest.js')).default;
    const commission = await CommissionRequest.findById(commissionId).populate('artist customer');
    console.log('[COMMISSION PAY] Loaded commission:', commission);
    if (!commission) return res.status(404).json({ error: 'Commission not found' });    if (commission.status !== 'requested') {
      console.log('[COMMISSION PAY] Commission not ready for payment. Status:', commission.status);
      return res.status(400).json({ error: 'Commission is not ready for payment.' });
    }
    
    // Validate artist's Stripe account status before allowing payment
    const artist = commission.artist;
    if (!artist.stripeAccountId) {
      return res.status(400).json({ error: 'Artist has no Stripe account set up.' });
    }
    
    if (!artist.stripePayoutsEnabled) {
      return res.status(400).json({ error: 'Artist Stripe account is not enabled for payouts. Commission cannot be paid at this time.' });
    }
    
    if (artist.stripeAccountStatus !== 'active') {
      return res.status(400).json({ error: `Artist Stripe account status is ${artist.stripeAccountStatus}. Commission cannot be paid at this time.` });
    }
    
    const stripeModule = await import('stripe');
    const stripeClient = stripeModule.default(process.env.STRIPE_SECRET_KEY);
    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: 'Custom Backing Track Commission',
              description: commission.requirements || 'Commissioned track',
            },
            unit_amount: Math.round(commission.price * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',      success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/commission/success/${commission._id}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/commission/cancel/${commission._id}`,
      metadata: {
        commissionId: commission._id.toString(),
        customerId: commission.customer._id.toString(),
        artistId: commission.artist._id.toString(),
      },
    });
    console.log('[COMMISSION PAY] Stripe checkout session created:', session.id, session.url);

    commission.stripeSessionId = session.id;
    await commission.save();
    return res.status(200).json({ sessionId: session.id, sessionUrl: session.url });
  } catch (err) {
    console.error('Error creating Stripe session for commission:', err);
    return res.status(500).json({ error: 'Failed to create Stripe session' });
  }
});

// Get commission by ID (customer, artist, or admin)
router.get('/:id', authMiddleware, getCommissionById);

export default router;
