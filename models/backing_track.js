import mongoose from 'mongoose';

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
  
  // Define key signature
  key: {
    enum: ["A", "B", "C", "D", "E", "F", "G"],
  },
  isFlat: {
    type: Boolean,
    default: false,
  },

  isSharp: {
    type: Boolean,
    default: false,
  },

  vocalRange: {
    type: String,
    enum: ["Soprano", "Mezzo-Soprano", "Contralto", "Countertenor", "Tenor", "Baritone", "Bass"],
  },

  genre: {
    type: String,
  },
  
  qualityValidated: {
    type: String,
    enum: ['yes', 'no'],
    default: 'no',
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  s3Key: { 
    type: String, 
    required: true 
  },

  purchaseCount: { 
    type: Number, 
    default: 0 
  },

  licenseStatus: {
    type: String,
    enum: ['unlicensed', 'licensed', 'pending'],
    default: 'pending',
  },

  downloadCount: {
    type: Number,
    default: 0,
  },

  ratings: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      stars: { type: Number, min: 1, max: 5, required: true }, 
      ratedAt: { type: Date, default: Date.now }
    }
  ],

  averageRating: {
    type: Number,
    default: 0
  }
});

// Add text index for title
backingTrackSchema.index({ title: 'text' });

// Method to calculate average rating
backingTrackSchema.methods.calculateAverageRating = function () {
  if (this.ratings.length === 0) {
    this.averageRating = 0;
    return;
  }

  const total = this.ratings.reduce((sum, rating) => sum + rating.stars, 0); // Calculate total stars
  this.averageRating = total / this.ratings.length; // Calculate average
}

// Virtual for musical key
backingTrackSchema.virtual('musicalKey').get(function () {
  if (this.isFlat && this.isSharp) {
    return "Cannot both be sharp and flat"; // Argument to stop both isFlat and isSharp existing
  }
  
  let keySignature = this.key;
  if (this.isFlat) keySignature += "b";
  if (this.isSharp) keySignature += "#";

  return keySignature;
});

// Sanitizing the schema before returning it as JSON
backingTrackSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString(); // Rename _id to id
    delete ret._id;              // Remove _id
    delete ret.__v;              // Remove version key
    delete ret.s3Key;            // Never send the s3Key (it’s sensitive)
    delete ret.ratings;          // Optionally, hide ratings unless explicitly needed
    return ret;
  }
});

// Create the model
const BackingTrack = mongoose.model('BackingTrack', backingTrackSchema);

export default BackingTrack;