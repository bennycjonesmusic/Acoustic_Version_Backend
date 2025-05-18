import dotenv from 'dotenv'; //added this to fix a bug with the query search not working!
dotenv.config(); // 

import mongoose from 'mongoose';
import BackingTrack from './models/backing_track.js';


const connectDB = async () => {

try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');

    // Sync indexes
    await BackingTrack.syncIndexes();
    console.log('Indexes synced for BackingTrack model');

    // Optional: exit the script
    process.exit(0);
  } catch (err) {
    console.error('MongoDB connection failed or index sync error:', err);
    process.exit(1);
  }
};

connectDB();
