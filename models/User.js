import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import adminEmails from '../utils/admins.js';

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, //perhaps use bcrypt here
  verified: {
  type: Boolean,
  default: false
}, //verify email
  role: { type: String, default: 'user', enum: ["user", "artist", "admin"]}, // 
  stripeAccountId: { type: String, required: false }, // 
  uploadedTracks: [{
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'BackingTrack'
  }],
  purchasedTracks: [{
    track: { type: mongoose.Schema.Types.ObjectId, ref: 'BackingTrack', required: true },
    paymentIntentId: { type: String, required: true },
    purchasedAt: { type: Date, default: Date.now },
    price: { type: Number }, // store price at time of purchase
    refunded: { type: Boolean, default: false }
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
  banned: { type: Boolean, default: false },
  totalIncome: { type: Number, default: 0 },
  averageTrackRating: {
    type: Number,
    default: 0
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
  },
  storageUsed: {
    type: Number,
    default: 0, // in bytes
    description: 'Total storage used by the user in bytes.'
  },
  availableForCommission: {

    type: Boolean,
    default: true,
  }, // Whether the artist is currently available for commissions
  numOfCommissions: {
    type: Number,
    default: 0,
    description: 'Number of completed commissions for this user.'
  },
  lastOnline: {
    type: Date,
    default: null,
    description: 'Timestamp of the user\'s last activity.'
  }
}, {
  timestamps: true, // 
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
    .map(track => typeof track.averageRating === 'number' ? track.averageRating : null)
    .filter(r => r !== null && !isNaN(r));
  if (ratings.length < 10) {
    this.averageTrackRating = 5; // Set to maximum if fewer than 10 ratings
  } else {
    this.averageTrackRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }
  await this.save();
};

//sanitize for security purposes

userSchema.set('toJSON', {
  transform: (doc, ret, options) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.password;

    const viewerRole = options?.viewerRole || 'user';
    const viewerId = options?.viewerId || null;

    const isAdmin = viewerRole === 'admin';
    const isSelf = viewerId && viewerId.toString() === ret.id;

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
    }

    // Ensure self can always see their own email and stripeAccountId
    if (isSelf) {
      if (doc.email) ret.email = doc.email;
      if (doc.stripeAccountId) ret.stripeAccountId = doc.stripeAccountId;
    }

    return ret;
  }
});

userSchema.index({username: "text"}); //add index to search for username

const User = mongoose.model('User', userSchema);
export default User;