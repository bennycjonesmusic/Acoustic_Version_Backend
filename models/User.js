import mongoose from 'mongoose'; // Import mongoose to use the schema

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {type: String, default: 'user'},
  uploadedTracks: [{
    type: mongoose.Schema.Types.ObjectId, // ObjectId type for linking to another model
    ref: 'BackingTrack', // This references the 'BackingTrack' model
    required: false // Not required for user creation

  }]
 
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt fields
});

const User = mongoose.model('User', userSchema); // Create the model. This will be used to create the usernames and passwords in the database.
export default User; // Export the model for use elsewhere in the app.