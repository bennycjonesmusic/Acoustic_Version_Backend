import express from 'express';
import authMiddleware from '../middleware/customer_auth.js';
import artistAuthMiddleware from '../middleware/artist_auth.js';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import CommissionRequest from '../models/CommissionRequest.js';

const router = express.Router();

// Get artist analytics data
router.get('/analytics', artistAuthMiddleware, async (req, res) => {  try {
    const userId = req.userId;
    
    // Get user with populated tracks and commission data
    const user = await User.findById(userId)
      .populate({
        path: 'uploadedTracks',
        select: 'title price purchaseCount averageRating numOfRatings createdAt downloadCount'
      })
      .select('totalIncome amountOfTracksSold numOfCommissions createdAt');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get commission data
    const commissions = await CommissionRequest.find({ artist: userId })
      .select('price status createdAt updatedAt')
      .sort({ createdAt: -1 });

    // Calculate analytics
    const tracks = user.uploadedTracks || [];
    const totalTracks = tracks.length;
    const totalSales = user.amountOfTracksSold || 0;
    const totalRevenue = user.totalIncome || 0;
    const totalCommissions = commissions.length;

    // Track performance metrics
    const trackPerformance = tracks.map(track => ({
      id: track._id,
      title: track.title,
      sales: track.purchaseCount || 0,
      revenue: (track.purchaseCount || 0) * (track.price || 0),
      rating: track.averageRating || 0,
      ratings: track.numOfRatings || 0,
      downloads: track.downloadCount || 0,
      comments: track.comments?.length || 0,
      uploadDate: track.createdAt
    }));

    // Revenue over time (last 12 months)
    const revenueByMonth = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toISOString().substr(0, 7); // YYYY-MM format
      revenueByMonth[monthKey] = 0;
    }

    // Calculate revenue from track sales (would need more detailed purchase data for exact calculations)
    // For now, we'll use available data and make reasonable estimates
    tracks.forEach(track => {
      if (track.purchaseCount > 0) {
        // Distribute sales across months (simplified - in reality you'd want actual purchase dates)
        const monthsActive = Math.min(12, Math.ceil((now - track.createdAt) / (1000 * 60 * 60 * 24 * 30)));
        const avgPerMonth = (track.purchaseCount * (track.price || 0)) / monthsActive;
        
        for (let i = 0; i < monthsActive; i++) {
          const date = new Date(track.createdAt.getFullYear(), track.createdAt.getMonth() + i, 1);
          const monthKey = date.toISOString().substr(0, 7);
          if (revenueByMonth[monthKey] !== undefined) {
            revenueByMonth[monthKey] += avgPerMonth;
          }
        }
      }
    });

    // Commission analytics
    const commissionStats = {      total: totalCommissions,
      completed: commissions.filter(c => c.status === 'completed').length,
      pending: commissions.filter(c => ['pending_artist', 'requested', 'accepted', 'in_progress', 'delivered'].includes(c.status)).length,
      revenue: commissions
        .filter(c => c.status === 'completed')
        .reduce((sum, c) => sum + (c.price || 0), 0)
    };

    // Top performing tracks
    const topTracks = trackPerformance
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentCommissions = commissions.filter(c => c.createdAt >= thirtyDaysAgo).length;
    const recentUploads = tracks.filter(t => t.createdAt >= thirtyDaysAgo).length;

    // Growth metrics (comparing last 30 vs previous 30 days)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const previousCommissions = commissions.filter(c => 
      c.createdAt >= sixtyDaysAgo && c.createdAt < thirtyDaysAgo
    ).length;

    const commissionGrowth = previousCommissions > 0 
      ? ((recentCommissions - previousCommissions) / previousCommissions) * 100 
      : recentCommissions > 0 ? 100 : 0;

    return res.status(200).json({
      overview: {
        totalTracks,
        totalSales,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalCommissions,
        averageTrackRating: tracks.length > 0 
          ? parseFloat((tracks.reduce((sum, t) => sum + (t.averageRating || 0), 0) / tracks.length).toFixed(1))
          : 0
      },
      trackPerformance,
      topTracks,
      revenueByMonth,
      commissionStats,
      recentActivity: {
        newCommissions: recentCommissions,
        newUploads: recentUploads,
        commissionGrowth: parseFloat(commissionGrowth.toFixed(1))
      },
      summary: {
        joinDate: user.createdAt,
        totalEarnings: parseFloat(totalRevenue.toFixed(2)),
        currency: 'GBP'
      }
    });

  } catch (error) {
    console.error('Error fetching artist analytics:', error);
    return res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

export default router;
