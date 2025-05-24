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
    ref: 'BackingTrack',
    required: false
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
  }
}, {
  timestamps: true, // 
});

// Middleware: Set role to admin if email is in adminEmails whitelist
userSchema.pre('save', function(next) {
  if (this.email && adminEmails.includes(this.email)) {
    this.role = 'admin';
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

    if (ret.role !== "artist" && ret.role !== "admin") {

      delete ret.uploadedTracks;
      delete ret.amountOfTracksSold;
      delete ret.amountOfFollowers;
      delete ret.stripeAccountId;
      delete ret.avatar;
    }

    //show less details if not admin or self
    if (!isAdmin && !isSelf) {
      delete ret.email;
      delete ret.stripeAccountId;
      delete ret.amountOfTracksSold;
      delete ret.amountOfFollowers;
      delete ret.purchasedTracks;
      delete ret.totalIncome;
      // Only show public uploaded tracks to public viewers
      if (Array.isArray(ret.uploadedTracks)) {
        ret.uploadedTracks = ret.uploadedTracks.filter(track => !track.isPrivate);
      }
      // Hide purchasedTracks from non-admins and non-self
     
    }
   
    return ret;
  }
});

userSchema.index({username: "text"}); //add index to search for username

const User = mongoose.model('User', userSchema);
export default User;