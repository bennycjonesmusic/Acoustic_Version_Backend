import mongoose from 'mongoose';

// IP address schema for tracking unique visitors
const ipAddressSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  firstSeen: { type: Date, default: Date.now },
});
// Optional: TTL index to expire IPs after 30 days
ipAddressSchema.index({ firstSeen: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const IPAddress = mongoose.model('IPAddress', ipAddressSchema);

const websiteSchema = new mongoose.Schema({
  // DMCA or copyright takedown requests
  takedownRequests: [
    {
      reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
      targetTrack: { type: mongoose.Schema.Types.ObjectId, ref: 'BackingTrack', required: true },
      reason: { type: String, required: true },
      status: { type: String, enum: ['pending', 'approved', 'rejected', 'removed'], default: 'pending' },
      createdAt: { type: Date, default: Date.now },
      resolvedAt: { type: Date },
      adminNotes: { type: String },
    }
  ],
  // Site-wide notices for users
  siteNotices: [
    {
      message: { type: String, required: true },
      type: { type: String, enum: ['info', 'warning', 'alert', 'maintenance'], default: 'info' },
      active: { type: Boolean, default: true },
      createdAt: { type: Date, default: Date.now },
      expiresAt: { type: Date },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }
  ],
  // Simple analytics for website hits
  analytics: {
    homePageHits: { type: Number, default: 0 },
    commissionMusicianHits: { type: Number, default: 0 },
    searchTracksHits: { type: Number, default: 0 },
    totalHits: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    lastHitAt: { type: Date }
  },
  // You can add more global site data here as needed
});

const Website = mongoose.model('Website', websiteSchema);
export default Website;
export { IPAddress };
