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
  // The price the customer pays (artist price + platform commission)
  customerPrice: {
    type: Number,
    required: true,
    min: [0, "Customer price must be positive"]
  },

  type: {
    type: String,
    enum: ["Backing Track", "Jam Track", "Acoustic Instrumental Version"],
    
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
  },  user: {
    type: mongoose.Schema.Types.ObjectId,  // ObjectId type for linking to another model
    ref: 'User', // This references the 'User' model
    required: true // Ensure that the track is always linked to a user
  }, 
  // Define key signature
  key: {
    type: String,
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

  isMajor: {
    type: Boolean,
    default: false,
  },

  isMinor: {
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
  isHigher: {

    type: Boolean,
    default: false
  },
  isLower: {
    type: Boolean,
    default: false
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
  },  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  fileSize: {
    type: Number,
    required: true,
    description: 'Size of the uploaded file in bytes.'
  },
  flags: [
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who flagged it
    reason: { type: String, required: true },                   // why it was flagged
    createdAt: { type: Date, default: Date.now },               // when flagged
    reviewed: { type: Boolean, default: false },                // has admin reviewed it?
  }
],
flagCount: {
  type: Number,
  default: 0,
},
isFlagged: {
  type: Boolean,
  default: false,
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
    this.numOfRatings = 0;
    return;
  }
  const total = this.ratings.reduce((sum, rating) => sum + rating.stars, 0); // Calculate total stars
  this.averageRating = total / this.ratings.length; // Calculate average
  this.numOfRatings = this.ratings.length;
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

// Virtual for vocal range gender
backingTrackSchema.virtual('vocalRangeGender').get(function () {
  if (!this.vocalRange) return null;
  
  const range = this.vocalRange.toLowerCase();
  
  // Female ranges
  if (range.includes('soprano') || range.includes('mezzo-soprano') || range.includes('contralto')) {
    return 'female';
  }
  
  // Male ranges
  if (range.includes('countertenor') || range.includes('tenor') || range.includes('baritone') || range.includes('bass')) {
    return 'male';
  }
  
  return null;
});

// Sanitizing the schema before returning it as JSON
backingTrackSchema.set('toJSON', {
  virtuals: true, // Include virtual fields in JSON output
  transform: (doc, ret, options) => {
    try {
      ret.id = ret._id?.toString?.() || ret.id;
      delete ret._id;
      delete ret.__v;
      delete ret.s3Key;

      // Include virtual fields
      ret.musicalKey = doc.musicalKey;
      ret.vocalRangeGender = doc.vocalRangeGender;

      const viewerRole = options?.viewerRole || 'user';
      const viewerId = options?.viewerId || null;
      const isAdmin = viewerRole === 'admin';      // Defensive: ret.user can be ObjectId or populated object
      let userIdString = null;
      if (ret.user) {
        if (typeof ret.user === 'object' && ret.user._id) {
          userIdString = ret.user._id.toString();
        } else if (typeof ret.user === 'string' || typeof ret.user === 'number') {
          userIdString = ret.user.toString();
        } else if (ret.user.toString) {
          userIdString = ret.user.toString();
        }
      }
      const isSelf = viewerId && userIdString && userIdString === viewerId.toString();
      // Show less details if not admin or self (owner)
      if (viewerRole === 'public' || (!isAdmin && !isSelf)) {
        delete ret.downloadCount;
        delete ret.licenseStatus;
      }
      // Always include previewUrl in output
      if (doc.previewUrl) {
        ret.previewUrl = doc.previewUrl;
      }
      // Only show youtubeGuideUrl and guideTrackUrl to buyers, owners, or admin
      var isBuyer = false;
      if (Array.isArray(options?.purchasedTrackIds) && ret.id) {
        isBuyer = options.purchasedTrackIds.some(
          (trackId) => trackId?.toString?.() === ret.id.toString()
        );
      }
      if (!(isAdmin || isSelf || isBuyer)) {
        delete ret.youtubeGuideUrl;
        delete ret.guideTrackUrl;
      }
      return ret;
    } catch (err) {
      console.error('Error in BackingTrack toJSON transform:', err, { ret, options });
      return ret;
    }
  }
});


// Indexes for optimized queries
backingTrackSchema.index({ user: 1 }); // Fast lookup of tracks by artist/owner
backingTrackSchema.index({ title: 'text' }); // Already present for text search

// Pre-validate hook to set customerPrice
backingTrackSchema.pre('validate', function(next) {
  // Automatically set customerPrice as price + 12% commission (rounded to 2 decimals)
  if (typeof this.price === 'number') {
    const commission = Math.round(this.price * 0.12 * 100) / 100; // 12% commission
    this.customerPrice = Math.round((this.price + commission) * 100) / 100;
  }
  next();
});

// Create the model
const BackingTrack = mongoose.model('BackingTrack', backingTrackSchema);

export default BackingTrack;