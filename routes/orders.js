import express from 'express';
import authMiddleware from '../middleware/customer_auth.js';
import User from '../models/User.js';
import CommissionRequest from '../models/CommissionRequest.js';
import BackingTrack from '../models/backing_track.js';

const router = express.Router();

// Get unified orders summary for the authenticated user (overview of tracks + commissions)
router.get('/my-orders', authMiddleware, async (req, res) => {
  try {
    const type = req.query.type || 'all'; // 'all', 'tracks', 'commissions'
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const user = await User.findById(req.userId).select('purchasedTracks');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let orders = [];
    let totalCount = 0;

    // Get tracks summary (if requested)
    if (type === 'all' || type === 'tracks') {
      const trackCount = user.purchasedTracks.filter(p => !p.refunded).length;
      if (trackCount > 0) {
        orders.push({
          category: 'Track Purchases',
          count: trackCount,
          endpoint: '/tracks/purchased-tracks',
          description: `${trackCount} purchased backing track${trackCount !== 1 ? 's' : ''}`,
          lastActivity: user.purchasedTracks.length > 0 
            ? Math.max(...user.purchasedTracks.map(p => new Date(p.purchasedAt).getTime()))
            : null
        });
      }
      totalCount += trackCount;
    }

    // Get commissions summary (if requested)
    if (type === 'all' || type === 'commissions') {
      const [customerCommissionCount, artistCommissionCount] = await Promise.all([
        CommissionRequest.countDocuments({ customer: req.userId }),
        CommissionRequest.countDocuments({ artist: req.userId })
      ]);

      if (customerCommissionCount > 0) {
        orders.push({
          category: 'Commission Orders (as Customer)',
          count: customerCommissionCount,
          endpoint: '/commission/customer/commissions',
          description: `${customerCommissionCount} custom track order${customerCommissionCount !== 1 ? 's' : ''}`,
          lastActivity: null // Could add this if needed
        });
      }

      if (artistCommissionCount > 0) {
        orders.push({
          category: 'Commission Work (as Artist)',
          count: artistCommissionCount,
          endpoint: '/commission/artist/commissions',
          description: `${artistCommissionCount} commission job${artistCommissionCount !== 1 ? 's' : ''}`,
          lastActivity: null // Could add this if needed
        });
      }

      totalCount += customerCommissionCount + artistCommissionCount;
    }

    // Simple pagination for the summary view
    const totalPages = Math.ceil(orders.length / limit);
    const skip = (page - 1) * limit;
    const paginatedOrders = orders.slice(skip, skip + limit);

    return res.status(200).json({
      orders: paginatedOrders,
      summary: {
        totalCategories: orders.length,
        totalItems: totalCount,
        message: totalCount === 0 
          ? 'No orders found. Start by purchasing tracks or commissioning custom backing tracks!'
          : `You have ${totalCount} total items across ${orders.length} categories.`
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalCategories: orders.length,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit
      },
      endpoints: {
        purchasedTracks: '/tracks/purchased-tracks',
        customerCommissions: '/commission/customer/commissions',
        artistCommissions: '/commission/artist/commissions'
      }
    });
  } catch (error) {
    console.error('Error fetching orders summary:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get detailed order information by ID and type
router.get('/order/:type/:id', authMiddleware, async (req, res) => {
  try {
    const { type, id } = req.params;
    
    if (type === 'track') {
      // Get track purchase details
      const user = await User.findById(req.userId)
        .populate({
          path: 'purchasedTracks.track',
          populate: { path: 'user', select: 'username avatar' }
        });
      
      const purchase = user?.purchasedTracks.find(p => 
        p._id.toString() === id || p.track?._id?.toString() === id
      );
      
      if (!purchase) {
        return res.status(404).json({ error: 'Track purchase not found' });
      }

      return res.status(200).json({
        type: 'track_purchase',
        id: purchase._id,
        track: purchase.track,
        purchaseDetails: {
          purchasedAt: purchase.purchasedAt,
          price: purchase.price,
          paymentIntentId: purchase.paymentIntentId,
          refunded: purchase.refunded,
          downloadCount: purchase.downloadCount || 0,
          lastDownloadedAt: purchase.lastDownloadedAt
        },
        actions: {
          download: `/tracks/download/${purchase.track._id}`,
          details: `/public/tracks/${purchase.track._id}`
        }
      });
    } 
    
    else if (type === 'commission') {
      // Get commission details
      const commission = await CommissionRequest.findById(id)
        .populate('customer', 'username email')
        .populate('artist', 'username avatar');
      
      if (!commission) {
        return res.status(404).json({ error: 'Commission not found' });
      }

      // Check authorization
      const isAuthorized = commission.customer._id.toString() === req.userId ||
                          commission.artist._id.toString() === req.userId ||
                          (req.user && req.user.role === 'admin');
      
      if (!isAuthorized) {
        return res.status(403).json({ error: 'Not authorized to view this commission' });
      }

      return res.status(200).json({
        type: 'commission_order',
        commission,
        actions: commission.status === 'paid' && commission.finishedTrackUrl 
          ? { download: `/commission/download?commissionId=${commission._id}&type=finished` }
          : {}
      });
    }
    
    else {
      return res.status(400).json({ error: 'Invalid order type. Use "track" or "commission"' });
    }
  } catch (error) {
    console.error('Error fetching order details:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get quick stats for user dashboard
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('purchasedTracks');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [purchasedCount, customerCommissions, artistCommissions] = await Promise.all([
      user.purchasedTracks.filter(p => !p.refunded).length,
      CommissionRequest.countDocuments({ customer: req.userId }),
      CommissionRequest.countDocuments({ artist: req.userId })
    ]);

    // Calculate total spending on tracks
    const totalSpent = user.purchasedTracks
      .filter(p => !p.refunded)
      .reduce((sum, p) => sum + (p.price || 0), 0);

    return res.status(200).json({
      purchasedTracks: purchasedCount,
      commissionsAsCustomer: customerCommissions,
      commissionsAsArtist: artistCommissions,
      totalSpent: parseFloat(totalSpent.toFixed(2)),
      currency: 'GBP'
    });
  } catch (error) {
    console.error('Error fetching order stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;