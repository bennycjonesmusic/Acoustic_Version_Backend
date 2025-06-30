import Website, { IPAddress } from '../models/website.js';
import BackingTrack from '../models/backing_track.js';
import User from '../models/User.js';

// Controller to increment unique visitors and total hits
export const trackSiteVisit = async (req, res) => {
  try {
    const ip = req.body?.ip || req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    let unique = false;
    // Try to insert the IP, only increment if new
    const existing = await IPAddress.findOne({ ip });
    if (!existing) {
      await IPAddress.create({ ip });
      await Website.updateOne({}, { $inc: { 'analytics.uniqueVisitors': 1 } });
      unique = true;
    }
    // Always increment totalHits and update lastHitAt
    await Website.updateOne({}, { $inc: { 'analytics.totalHits': 1 }, $set: { 'analytics.lastHitAt': new Date() } });
    return res.status(200).json({ unique });
  } catch (err) {
    console.error('Error tracking site visit:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateOnlyUnique = async (req, res) => {
try {
    const ip = req.body?.ip || req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    let unique = false;
    const existing = await IPAddress.findOne({ ip});
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

// Controller to increment totalHits for a track
export const trackBackingTrackHit = async (req, res) => {
  try {
    const { trackId } = req.params;
    await BackingTrack.updateOne({ _id: trackId }, { $inc: { 'analytics.totalHits': 1 } });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error tracking track hit:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

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
