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
    lastHitAt: { type: Date },
    pageHits: { type: Map, of: Number, default: {} }, // Track hits per page URL
    weeklyHits: { type: [ { weekStart: Date, count: Number } ], default: [] }, // Track total hits per week
    dailyHitsLast30: { type: [Number], default: [] }, // Array of 30 daily hit counts
    dailyHitsLast30Dates: { type: [Date], default: [] }, // Array of 30 dates (midnight UTC)
  },
  // Error tracking with 7-day rolling window
  errorLog: [
    {
      message: { type: String, required: true },
      stack: { type: String },
      endpoint: { type: String }, // Which API endpoint
      method: { type: String }, // HTTP method (GET, POST, etc.)
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User who experienced the error (if authenticated)
      userEmail: { type: String }, // Email if available
      ip: { type: String }, // IP address
      userAgent: { type: String }, // Browser/client info
      statusCode: { type: Number }, // HTTP status code
      requestBody: { type: mongoose.Schema.Types.Mixed }, // Sanitized request data
      errorType: { type: String, enum: ['general', 'stripe_webhook', 'stripe_payment', 'auth', 'database', 'validation'], default: 'general' }, // Error category
      stripeEventType: { type: String }, // For Stripe webhook errors
      timestamp: { type: Date, default: Date.now, expires: 604800 } // Expires after 7 days (604800 seconds)
    }
  ],
  // You can add more global site data here as needed
});

// Production performance indexes for error tracking
websiteSchema.index({ 'errorLog.timestamp': -1 }); // Error log queries by date
websiteSchema.index({ 'errorLog.errorType': 1, 'errorLog.timestamp': -1 }); // Error filtering by type and date

const Website = mongoose.model('Website', websiteSchema);
export default Website;
export { IPAddress };
