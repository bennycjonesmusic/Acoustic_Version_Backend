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
  
  //define key signature, will be used in querying.
  key: {
    enum: ["A", "B", "C", "D", "E", "F", "G"],
    required: false,

    

  },
    isFlat: {
    type: Boolean,
    default: false,
    required: false,
  },

  isSharp: {
    type: Boolean,
    default: false,
    required: false,
  },

  vocalRange: {

    type: String,
    enum: ["Soprano", "Mezzo-Soprano", "Contralto", "Countertenor", "Tenor", "Baritone", "Bass;"],
    required: false,
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
  ratings: [
{
user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
stars: {type: Number, min: 1, max: 5, required: true}, 
ratedAt: { type: Date, default: Date.now }

// ratings with stars.
  
},
  ],

averageRating: {
  type: Number,
  default: 0
} //compute average rating, function below

  
  //reviews: [reviewSchema] //need to make review schema


});

backingTrackSchema.index({ title: 'text' });



//method for average rating
backingTrackSchema.methods.calculateAverageRating = function () {

  if (this.ratings.length === 0){
    this.averageRating = 0;
    return;
  }
const total = this.ratings.reduce((sum, rating) => sum + rating.stars, 0); //use array method to get average.
//sum is running total, and rating is current val. 0 is the starting value of sum in this instance

this.averageRating = total / this.ratings.length; //normal way of getting average. total divided by num of items
}

backingTrackSchema.virtual('musicalKey').get(function() {
if (this.isFlat && this.isSharp){

    return "Cannot both be sharp and flat";//argument to stop both isFlat and isSharp existing
  }
  let keySignature = this.key;
  if (this.isFlat) keySignature += "b";
  if (this.isSharp) keySignature += "#";
  

  return keySignature;

});


// Create the model
const BackingTrack = mongoose.model('BackingTrack', backingTrackSchema);

export default BackingTrack;