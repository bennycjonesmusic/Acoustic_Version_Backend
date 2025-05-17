import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, //perhaps use bcrypt here
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
  
  }
}, {
  timestamps: true, // 
});

const User = mongoose.model('User', userSchema);
export default User;