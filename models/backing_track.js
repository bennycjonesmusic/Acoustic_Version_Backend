import mongoose from 'mongoose';

//I'll be honest, I used AI to generate this code initially. Will revise later for more personalization.

// Define the schema for the backing track
const backingTrackSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: [0, "Price must be positive"]
  },
  fileUrl: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,  // ObjectId type for linking to another model
    ref: 'User', // This references the 'User' model
    required: true // Ensure that the track is always linked to a user
  },
  genre: {
    type: String,
    required: false,

  }, qualityValidated: {
    type: String,
    enum: ['yes', 'no'],
    default: 'no',


  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  s3Key: { type: String, required: true },
  purchaseCount: { type: Number, default: 0 },
  licenseStatus: {
    type: String,
    enum: ['unlicensed', 'licensed', 'pending'],
    default: 'pending',
  }, downloadCount: {
    type: Number,
    default: 0,
  },
  reviews: [reviewSchema]


});

backingTrackSchema.index({ name: 'text' });

// Create the model
const BackingTrack = mongoose.model('BackingTrack', backingTrackSchema);

export default BackingTrack;