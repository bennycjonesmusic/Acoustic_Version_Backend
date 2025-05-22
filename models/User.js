import mongoose from 'mongoose';

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
  boughtTracks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BackingTrack',
    required: false
  }], amountOfTracksSold: {
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
  passwordResetExpires: { type: Date }
}, {
  timestamps: true, // 
});

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



    //show less details if not admin or self
    if (viewerRole === 'public' || (!isAdmin && !isSelf)) {
      delete ret.email;
      delete ret.stripeAccountId;
      delete ret.amountOfTracksSold;
      delete ret.amountOfFollowers;
    }

    return ret;
  }
});

userSchema.index({username: "text"}); //add index to search for username

const User = mongoose.model('User', userSchema);
export default User;