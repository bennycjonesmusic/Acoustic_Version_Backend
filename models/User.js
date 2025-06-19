import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import adminEmails from '../utils/admins.js';

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  email: { type: String, required: true }, // removed unique: true to avoid duplicate index warning
  password: { type: String, required: true }, //perhaps use bcrypt here
  verified: {
  type: Boolean,
  default: false
}, //verify email
  role: { type: String, default: 'user', enum: ["user", "artist", "admin"]}, // 
  stripeAccountId: { type: String, required: false }, // 

  stripeAccountStatus: {
  type: String,
  enum: ['pending', 'active', 'restricted', 'rejected'],
  default: 'pending',
  description: 'Stripe Connect account onboarding status'
},
stripePayoutsEnabled: {
  type: Boolean,
  default: false,
  description: 'Whether the artist can receive payouts'
},
stripeOnboardingComplete: {
  type: Boolean,
  default: false,
  description: 'Whether Stripe onboarding is complete'
},
  uploadedTracks: [{
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'BackingTrack'
  }],  purchasedTracks: [{
    track: { type: mongoose.Schema.Types.ObjectId, ref: 'BackingTrack', required: true },
    paymentIntentId: { type: String, required: true },
    purchasedAt: { type: Date, default: Date.now },
    price: { type: Number }, // store price at time of purchase
    refunded: { type: Boolean, default: false },
    refundedAt: { type: Date }, // when the refund was processed
    downloadCount: { type: Number, default: 0 }, // track how many times downloaded
    lastDownloadedAt: { type: Date } // last download timestamp
  }],
  amountOfTracksSold: {
    type: Number,
    default : 0,
  
  },
  following: [{
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  amountOfFollowers: { type: Number, default: 0 },
  about: { type: String, default: '' },
  avatar: {
    type: String,
    default: '', // or a default profile pic URL 
  },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
  numOfReviews: {
    type: Number,
    default: 0
  },
  reviews: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  artistExamples: [{
    url: { type: String, required: true },
    description: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now }
  }],
  artistYoutubeLink: { type: String, default: '' }, //for Iframe embed
  
  banned: { type: Boolean, default: false },
  totalIncome: { type: Number, default: 0 },
  // Money owed to this user (for cart purchases, commissions, etc.)
  moneyOwed: [{
    amount: { type: Number, required: true }, // Amount in pounds (not pence)
    reference: { type: String, required: true }, // Description of what this payment is for
    createdAt: { type: Date, default: Date.now },
    source: { type: String, required: true }, // 'cart_purchase', 'commission', etc.
    metadata: { type: Object, default: {} } // Additional data (trackIds, customerEmail, etc.)
  }],
  averageTrackRating: {
    type: Number,
    default: 0
  },  maxTimeTakenForCommission: {
    type: String,
    default: '1 week',
  },
  artistInstrument: {
    type: String,
    default: '',


  },
  commissionPrice: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Default price (in GBP) for a commission from this artist.'
  },
  customerCommissionPrice: {
    type: Number,
    default: 0, // Default is 0 (matches commissionPrice + platform fee if commissionPrice is 0)
    description: 'Total price client pays (artist price + platform fee)'
  },
  profileStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: function() { return this.role === 'artist' ? 'pending' : 'approved'; },
    description: 'Artist profile approval status. Only approved artists are public.'
  },
  subscriptionTier: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free',
    description: 'User subscription tier for storage and features.'
  },
  stripeSubscriptionId: {
    type: String,
    description: 'Stripe subscription ID for recurring payments.'
  },  storageUsed: {
    type: Number,
    default: 0, // in bytes
    description: 'Total storage used by the user in bytes.'
  },
  cart: [{
    track: { type: mongoose.Schema.Types.ObjectId, ref: 'BackingTrack'},
    addedAt: { type: Date, default: Date.now }
  }],
  availableForCommission: {

    type: Boolean,
    default: true,  }, // Whether the artist is currently available for commissions
  numOfCommissions: {
    type: Number,
    default: 0,
    description: 'Number of completed commissions for this user.'
  },
  averageCommissionCompletionTime: {
    type: Number,
    default: 0,
    description: 'Average time in days to complete commissions for this artist.'
  },  lastOnline: {
    type: Date,
    default: null,
    description: 'Timestamp of the user\'s last activity.'
  },
  hasLoggedInBefore: {
    type: Boolean,
    default: false,
    description: 'Whether the user has ever logged in (for first-time login notifications).'
  },
  numOfUploadedTracks: {
    type: Number,
    default: 0,
  }
}, {
  timestamps: true, // 
});

// Virtual field for maximum storage based on subscription tier
userSchema.virtual('maxStorage').get(function() {
  // Storage limits based on subscription tier (matching song_upload.js)
  if (this.subscriptionTier === 'pro') return 10 * 1024 * 1024 * 1024; // 10GB
  if (this.subscriptionTier === 'enterprise') return 100 * 1024 * 1024 * 1024; // 100GB
  return 1024 * 1024 * 1024; // 1GB for free tier (default)
});

// Virtual field for storage usage percentage
userSchema.virtual('storageUsagePercentage').get(function() {
  return Math.round((this.storageUsed / this.maxStorage) * 100);
});

// Middleware: Set role to admin if email is in adminEmails whitelist
userSchema.pre('save', function(next) {
  if (this.email && adminEmails.includes(this.email)) {
    this.role = 'admin';
  }
  // Auto-calculate customerCommissionPrice if commissionPrice is set, else set to 0
  const platformCommissionRate = 0.15; // 15% platform fee
  if (typeof this.commissionPrice === 'number' && this.commissionPrice > 0) {
    this.customerCommissionPrice = Math.round((this.commissionPrice + (this.commissionPrice * platformCommissionRate)) * 100) / 100;
  } else {
    this.customerCommissionPrice = 0;
  }
  next();
});

// Block banned users from logging in or performing actions
userSchema.methods.isBanned = function() {
  return !!this.banned;
};

// Method to calculate average track rating
userSchema.methods.calculateAverageTrackRating = async function() {
  // Populate uploadedTracks with ratings
  await this.populate({
    path: 'uploadedTracks',
    select: 'averageRating',
  });
  const tracks = this.uploadedTracks || [];
  const ratings = tracks
    .map(track => typeof track.averageRating === 'number' && track.averageRating > 0 ? track.averageRating : null)
    .filter(r => r !== null && !isNaN(r));
  if (ratings.length < 10) {
    this.averageTrackRating = 5; // Set to maximum if fewer than 10 ratings
  } else {
    this.averageTrackRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }
  await this.save();
};

// Method to calculate and update average commission completion time
userSchema.methods.calculateAverageCommissionCompletionTime = async function() {
  try {
    // Import CommissionRequest model dynamically to avoid circular dependency
    const CommissionRequest = mongoose.model('CommissionRequest');
    
    // Find all completed commissions for this artist where both createdAt and completedAt exist
    const completedCommissions = await CommissionRequest.find({
      artist: this._id,
      status: 'completed',
      createdAt: { $exists: true },
      completedAt: { $exists: true }
    }).select('createdAt completedAt');

    if (completedCommissions.length === 0) {
      // No completed commissions, reset to 0
      this.averageCommissionCompletionTime = 0;
      this.numOfCommissions = 0;
    } else {
      // Calculate completion times in days
      const completionTimes = completedCommissions.map(commission => {
        const createdAt = new Date(commission.createdAt);
        const completedAt = new Date(commission.completedAt);
        const diffMs = completedAt - createdAt;
        const diffDays = diffMs / (1000 * 60 * 60 * 24); // Convert ms to days
        return diffDays;
      });

      // Calculate average completion time
      const totalTime = completionTimes.reduce((sum, time) => sum + time, 0);
      this.averageCommissionCompletionTime = Math.round((totalTime / completionTimes.length) * 100) / 100; // Round to 2 decimal places
      this.numOfCommissions = completedCommissions.length;
    }

    await this.save();
    return this.averageCommissionCompletionTime;
  } catch (error) {
    console.error('Error calculating average commission completion time:', error);
    throw error;
  }
};

//sanitize for security purposes

userSchema.set('toJSON', {
  virtuals: true, // Include virtual fields
  transform: (doc, ret, options) => {
    // Safety check for _id and create id field
    if (ret._id) {
      ret.id = ret._id.toString();
      delete ret._id;
    }
    delete ret.__v;
    delete ret.password;
    delete ret.stripeAccountId; // Always hide Stripe account ID from all users

    const viewerRole = options?.viewerRole || 'user';
    const viewerId = options?.viewerId || null;

    const isAdmin = viewerRole === 'admin';
    // Use ret.id for comparison BEFORE we potentially delete it
    const isSelf = viewerId && ret.id && viewerId.toString() === ret.id;

    // show less details if not admin or self
    if (!isAdmin && !isSelf) {
      delete ret.email;
      delete ret.stripeAccountId;
      delete ret.stripeSubscriptionId
      delete ret.amountOfTracksSold;
      delete ret.amountOfFollowers;
      delete ret.purchasedTracks;
      delete ret.totalIncome;
      if (Array.isArray(ret.uploadedTracks)) {
        ret.uploadedTracks = ret.uploadedTracks.filter(track => !track.isPrivate);
      }
    }    // Ensure self can always see their own email
    if (isSelf) {
      if (doc.email) ret.email = doc.email;
    }

    return ret;
  }
});

userSchema.index({username: "text"}); //add index to search for username
userSchema.index({ email: 1 }, { unique: true }); // Ensure fast lookups and uniqueness for email

const User = mongoose.model('User', userSchema);
export default User;