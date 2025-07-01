import Website, { IPAddress } from '../models/website.js';
import BackingTrack from '../models/backing_track.js';
import User from '../models/User.js';

// Controller to increment unique visitors and total hits
export const trackSiteVisit = async (req, res) => {
  try {
    const ip = req.body?.ip || req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    let pageUrl = req.body?.pageUrl || null;
    let unique = false;
    console.log(`[trackSiteVisit] Incoming IP:`, ip, pageUrl ? `Page: ${pageUrl}` : '');
    console.log('[DEBUG] req.body:', req.body, 'pageUrl:', req.body?.pageUrl);
    // Normalize track detail pages to '/tracks' for analytics
    if (pageUrl && /^\/tracks\/[\w-]+$/.test(pageUrl)) {
      pageUrl = '/tracks';
    }
    // Try to insert the IP, only increment if new
    const existing = await IPAddress.findOne({ ip });
    if (!existing) {
      await IPAddress.create({ ip });
      await Website.updateOne({}, { $inc: { 'analytics.uniqueVisitors': 1 } });
      unique = true;
      console.log(`[trackSiteVisit] New unique IP added:`, ip);
    } else {
      console.log(`[trackSiteVisit] IP already exists, not unique:`, ip);
    }
    // Always increment totalHits and update lastHitAt
    await Website.updateOne(
      {},
      {
        $inc: { 'analytics.totalHits': 1 },
        $set: { 'analytics.lastHitAt': new Date() }
      },
      { upsert: true }
    );
    // Increment weeklyHits for the current week
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // Sunday as start of week
    await Website.updateOne(
      {
        'analytics.weeklyHits.weekStart': weekStart
      },
      {
        $inc: { 'analytics.weeklyHits.$.count': 1 }
      }
    );
    // If no entry for this week, push a new one
    await Website.updateOne(
      {
        'analytics.weeklyHits.weekStart': { $ne: weekStart }
      },
      {
        $push: { 'analytics.weeklyHits': { weekStart, count: 1 } }
      }
    );
    // Optionally log or store the pageUrl for analytics
    if (pageUrl) {
      await Website.updateOne(
        {},
        { $inc: { [`analytics.pageHits.${pageUrl}`]: 1 } }
      );
    }
    return res.status(200).json({ unique });
  } catch (err) {
    console.error('Error tracking site visit:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller to get total website views per week
export const getWeeklyWebsiteHits = async (req, res) => {
  try {
    const website = await Website.findOne();
    if (!website || !website.analytics || !website.analytics.weeklyHits) {
      return res.status(200).json({ weeklyHits: [] });
    }
    // Sort by weekStart ascending
    const weeklyHits = [...website.analytics.weeklyHits].sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
    return res.status(200).json({ weeklyHits });
  } catch (error) {
    console.error('Error getting weekly website hits:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller to get all pageHits (page URLs and their hit counts)
export const getAllPageHits = async (req, res) => {
  try {
    const website = await Website.findOne();
    if (!website || !website.analytics || !website.analytics.pageHits) {
      return res.status(200).json({ pageHits: {} });
    }
    // Use the plain object directly (MongoDB stores as object, not Map)
    const pageHits = website.analytics.pageHits;
    return res.status(200).json({ pageHits });
  } catch (error) {
    console.error('Error getting all page hits:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller to get most viewed, least viewed, and total overall track hits
export const getTrackViewStats = async (req, res) => {
  try {
    const tracks = await BackingTrack.find({}, 'analytics.totalHits title');
    if (!tracks || tracks.length === 0) {
      return res.status(200).json({ mostViewed: null, leastViewed: null, totalHits: 0 });
    }
    let totalHits = 0;
    tracks.forEach(track => {
      totalHits += track.analytics?.totalHits || 0;
    });
    // Sort tracks by totalHits ascending
    const sorted = tracks.slice().sort((a, b) => (a.analytics?.totalHits || 0) - (b.analytics?.totalHits || 0));
    const leastViewed = sorted[0];
    const mostViewed = sorted[sorted.length - 1];
    return res.status(200).json({
      mostViewed: { id: mostViewed._id, title: mostViewed.title, totalHits: mostViewed.analytics?.totalHits || 0 },
      leastViewed: { id: leastViewed._id, title: leastViewed.title, totalHits: leastViewed.analytics?.totalHits || 0 },
      totalHits
    });
  } catch (error) {
    console.error('Error getting track view stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller to get totalHits for all tracks uploaded by a user
export const getUserTotalHits = async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'uploadedTracks',
      select: 'analytics',
      model: 'BackingTrack',
    });
    console.log('Populated user.uploadedTracks:', user.uploadedTracks);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const total = user.uploadedTracks.reduce((acc, track) => {
      return acc + (track.analytics?.totalHits || 0);
    }, 0);
    return res.status(200).json({ totalHits: total });
  } catch (error) {
    console.error('Error getting user total hits:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller to increment totalHits for a track
export const trackBackingTrackHit = async (req, res) => {
  try {
    const { trackId } = req.params;
    // Always increment totalHits
    await BackingTrack.updateOne({ _id: trackId }, { $inc: { 'analytics.totalHits': 1 } });
    // Increment weeklyHits for the current week
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // Sunday as start of week
    // Try to increment if week exists
    const result = await BackingTrack.updateOne(
      { _id: trackId, 'analytics.weeklyHits.weekStart': weekStart },
      { $inc: { 'analytics.weeklyHits.$.count': 1 } }
    );
    // If no entry for this week, push a new one
    if (result.modifiedCount === 0) {
      await BackingTrack.updateOne(
        { _id: trackId, 'analytics.weeklyHits.weekStart': { $ne: weekStart } },
        { $push: { 'analytics.weeklyHits': { weekStart, count: 1 } } }
      );
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error tracking track hit:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller to update only unique visitors (and total hits)
export const updateOnlyUnique = async (req, res) => {
  try {
    const ip = req.body?.ip || req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    let unique = false;
    const existing = await IPAddress.findOne({ ip });
    if (!existing) {
      await IPAddress.create({ ip });
      await Website.updateOne({}, { $inc: { 'analytics.uniqueVisitors': 1 } });
      unique = true;
    }
    await Website.updateOne({}, { $inc: { 'analytics.totalHits': 1 }, $set: { 'analytics.lastHitAt': new Date() } });
    return res.status(200).json({ unique });
  } catch (error) {
    console.error('Error updating unique visitors:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Controller to get total track views per week for a user (artist)
export const getUserTrackWeeklyHits = async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'uploadedTracks',
      select: 'analytics',
      model: 'BackingTrack',
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Aggregate weekly hits across all uploaded tracks
    const weeklyMap = new Map(); // weekStart (ISO string) -> count
    user.uploadedTracks.forEach(track => {
      if (track.analytics && Array.isArray(track.analytics.weeklyHits)) {
        track.analytics.weeklyHits.forEach(wh => {
          const key = new Date(wh.weekStart).toISOString();
          weeklyMap.set(key, (weeklyMap.get(key) || 0) + (wh.count || 0));
        });
      }
    });
    // Convert to sorted array
    const weeklyHits = Array.from(weeklyMap.entries())
      .map(([weekStart, count]) => ({ weekStart, count }))
      .sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
    return res.status(200).json({ weeklyHits });
  } catch (error) {
    console.error('Error getting user track weekly hits:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
