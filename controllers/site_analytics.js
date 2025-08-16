import Website, { IPAddress } from '../models/website.js';
import BackingTrack from '../models/backing_track.js';
import User from '../models/User.js';

// Controller to increment unique visitors and total hits
export const trackSiteVisit = async (req, res) => {
  try {
    const ip = (req.body?.ip)
      || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : undefined)
      || req.ip
      || req.connection.remoteAddress;
    let pageUrl = req.body?.pageUrl || null;
    let unique = false;
    
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

    // --- 30-day daily hits logic ---
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Midnight UTC
    const website = await Website.findOne();
    if (website) {
      let { dailyHitsLast30 = [], dailyHitsLast30Dates = [] } = website.analytics;
      if (dailyHitsLast30.length === 0 || dailyHitsLast30Dates.length === 0) {
        // Initialize
        dailyHitsLast30 = [1];
        dailyHitsLast30Dates = [today];
      } else {
        const lastDate = new Date(dailyHitsLast30Dates[dailyHitsLast30Dates.length - 1]);
        lastDate.setUTCHours(0, 0, 0, 0);
        if (today.getTime() === lastDate.getTime()) {
          // Same day, increment last value
          dailyHitsLast30[dailyHitsLast30.length - 1] += 1;
        } else {
          // New day
          dailyHitsLast30.push(1);
          dailyHitsLast30Dates.push(today);
          if (dailyHitsLast30.length > 30) {
            dailyHitsLast30.shift();
            dailyHitsLast30Dates.shift();
          }
        }
      }
      // Save back to DB
      website.analytics.dailyHitsLast30 = dailyHitsLast30;
      website.analytics.dailyHitsLast30Dates = dailyHitsLast30Dates;
      await website.save();
    }
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
      return res.status(200).json({ mostViewed: null, leastViewed: null, totalHits: 0, top10: [] });
    }
    let totalHits = 0;
    tracks.forEach(track => {
      totalHits += track.analytics?.totalHits || 0;
    });
    // Sort tracks by totalHits ascending
    const sorted = tracks.slice().sort((a, b) => (a.analytics?.totalHits || 0) - (b.analytics?.totalHits || 0));
    const leastViewed = sorted[0];
    const mostViewed = sorted[sorted.length - 1];
    // Top 10 most viewed tracks (descending order)
    const top10 = tracks
      .slice()
      .sort((a, b) => (b.analytics?.totalHits || 0) - (a.analytics?.totalHits || 0))
      .slice(0, 10)
      .map(track => ({
        id: track._id,
        title: track.title,
        totalHits: track.analytics?.totalHits || 0
      }));
    return res.status(200).json({
      mostViewed: { id: mostViewed._id, title: mostViewed.title, totalHits: mostViewed.analytics?.totalHits || 0 },
      leastViewed: { id: leastViewed._id, title: leastViewed.title, totalHits: leastViewed.analytics?.totalHits || 0 },
      totalHits,
      top10
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

// Controller to get last 30 days daily site hits
export const getDailyHitsLast30 = async (req, res) => {
  try {
    const website = await Website.findOne();
    if (!website || !website.analytics || !website.analytics.dailyHitsLast30) {
      return res.status(200).json({ dailyHits: [] });
    }
    // Optionally include dates for graphing
    return res.status(200).json({
      dailyHits: website.analytics.dailyHitsLast30,
      dates: website.analytics.dailyHitsLast30Dates
    });
  } catch (error) {
    console.error('Error getting last 30 days daily hits:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


export const getMostVisitedTrack = async (req, res) => {
  try {
    // Only select the fields needed for analytics and uploader
    const track = await BackingTrack.findOne({ 'analytics.totalHits': { $gt: 0 } })
      .sort({ 'analytics.totalHits': -1 })
      .select('title analytics user')
      .populate({ path: 'user', select: 'username email _id' });
    if (!track) {
      return res.status(404).json({ message: 'No tracks found' });
    }
    // Return only the minimal info needed
    return res.status(200).json({
      id: track._id,
      title: track.title,
      totalHits: track.analytics?.totalHits || 0,
      uploader: track.user ? {
        id: track.user._id,
        username: track.user.username,
        email: track.user.email
      } : null
    });
  } catch (error) {
    console.error('Error getting most visited track:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export const getLeastVisitedTrack = async (req, res) => {
  try {
    // Only select the fields needed for analytics and uploader
    const track = await BackingTrack.findOne({ 'analytics.totalHits': { $gt: 0 } })
      .sort({ 'analytics.totalHits': 1 })
      .select('title analytics user')
      .populate({ path: 'user', select: 'username email _id' });
    if (!track) {
      return res.status(404).json({ message: 'No tracks found' });
    }
    // Return only the minimal info needed
    return res.status(200).json({
      id: track._id,
      title: track.title,
      totalHits: track.analytics?.totalHits || 0,
      uploader: track.user ? {
        id: track.user._id,
        username: track.user.username,
        email: track.user.email
      } : null
    });
  } catch (error) {
    console.error('Error getting least visited track:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}