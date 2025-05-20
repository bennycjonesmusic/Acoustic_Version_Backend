import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, //perhaps use bcrypt here
  verified: {
  type: Boolean,
  default: false
}, //verify email
  role: { type: String, default: 'user' }, // 
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
}, {
  timestamps: true, // 
});

//sanitize for security purposes
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  }
});

const User = mongoose.model('User', userSchema);
export default User;