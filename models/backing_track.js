import mongoose from 'mongoose';

// Define the schema for the backing track
const backingTrackSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  originalArtist: {

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

  //enable users to set their tracks as private
  isPrivate: {

    type: Boolean,
    default: false
  },
  privateAccessToken: {
    type: String,
    default: "",



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

  backingTrackType: {

    type: String,
    enum: ["Acoustic Guitar", "Piano", "Full Arrangement Track", "Other"],
    default: "Acoustic Guitar",


  },

  vocalRange: {
    type: String,
    enum: ["Soprano", "Mezzo-Soprano", "Contralto", "Countertenor", "Tenor", "Baritone", "Bass"],
  },

  genre: {
    type: String,
    enum: ["Pop", "Rock", "Folk", "Jazz", "Classical", "Musical Theatre", "Country", "Other"]
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
    enum: ['unlicensed', 'licensed', 'not_required'],
    default: 'not_required',
  },

  licensedFrom: {

    type: String,
    validate: {

      validator: function(val) {
      if (this.licenseStatus === 'licensed') {



        return typeof val === 'string' && val.trim().length > 0; //ensure not empty
      }

      return true;
    

    },
      message: 'Licensed from must be a non-empty string when licenseStatus is "licensed".'
    }


  },

  downloadCount: {
    type: Number,
    default: 0,
  },

  numOfRatings: {
    type: Number,
    default: 0
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
  },

  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }


  }],

  previewUrl: {
    type: String
  },

  instructions: {
    type: String,
    default: ''
  },
  youtubeGuideUrl: {
    type: String,
    default: ''
  },
  guideTrackUrl: {
    type: String,
    default: ''
  }

});



// Method to generate a shareable URL for this track
backingTrackSchema.methods.getShareUrl = function () {
  // Adjust the base URL as needed for your deployment
  return `https://acousticversion.co.uk/track/${this._id}`;
};

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
  transform: (doc, ret, options) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.s3Key;

  

    const viewerRole = options?.viewerRole || 'user';
    const viewerId = options?.viewerId || null;
    const isAdmin = viewerRole === 'admin';
    // If the track has a user field, check if the viewer is the owner
    const isSelf = viewerId && ret.user && ret.user.toString() === viewerId.toString();
    // Show less details if not admin or self (owner)
    if (viewerRole === 'public' || (!isAdmin && !isSelf)) {
      // Hide downloadCount and licenseStatus for public and non-owners
      delete ret.downloadCount;
      delete ret.licenseStatus;
      // add to hide more stuff. Check when on frontend and adjust as needed.
    }

    // Always include previewUrl in output
    if (doc.previewUrl) {
      ret.previewUrl = doc.previewUrl;
    }
    // Only show youtubeGuideUrl to buyers or owners or admin
    if (!(isAdmin || isSelf || (doc.boughtBy && doc.boughtBy.includes(viewerId)))) {
      delete ret.youtubeGuideUrl;
      delete ret.guideTrackUrl;
    }
    return ret;
  }
});


// Add text index for title
backingTrackSchema.index({ title: 'text' });

// Create the model
const BackingTrack = mongoose.model('BackingTrack', backingTrackSchema);

export default BackingTrack;