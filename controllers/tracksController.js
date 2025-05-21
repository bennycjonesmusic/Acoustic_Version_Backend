import fs from 'fs'; // for reading & deleting temp files
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage'; // for streaming uploads to S3
import BackingTrack from '../models/backing_track.js';
import User from '../models/User.js'; // 
import { parseKeySignature } from '../utils/parseKeySignature.js';
import { uploadTrackSchema, reviewSchema } from './validationSchemas.js';

export const rateTrack = async(req, res) => {
try{
    //function for rating tracks
    const { rating } = req.body;
    const user = await User.findById(req.userId);
    if (!user) {
        return res.status(404).json({message: "User not found"});
    }
    //find user from token

    //find the track from the id in the url
    const track = await BackingTrack.findById(req.params.id);
    if (!track) {
        return res.status(404).json({message: "Track not found"});
    }
    //check if user has NOT bought the track
    if (!user.boughtTracks.some(id => id.equals(track._id))) {
        return res.status(400).json({ message: "You can only rate tracks you have purchased." });
    }
    //validate rating input
    const { error } = reviewSchema.validate({ rating });
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }
    // Only allow one rating per user per track (update if exists)
    const existingRating = track.ratings.find(r => r.user.equals(user._id));
    if (existingRating) {
        existingRating.stars = rating;
        existingRating.ratedAt = new Date();
    } else {
        track.ratings.push({
            user: user._id,
            stars: rating,
            ratedAt: new Date()
        });
    }
    track.calculateAverageRating();
    await track.save();
    return res.status(200).json({message: "Rating submitted successfully", track});
}catch(error) {
    console.error('Error reviewing track:', error);
    return res.status(500).json({message: 'Internal server error'})
}



}

export const uploadTrack = async (req, res) => {

    //check first of all if the body follows the schema (JOI validation)
    
    const { error } = uploadTrackSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    //if error return the error message
    // if no error, continue with logic
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        // Use the buffer directly from multer.memoryStorage
        const fileStream = Buffer.from(req.file.buffer);
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `songs/${Date.now()}-${req.file.originalname}`,
            Body: fileStream,
            ACL: 'private',
            StorageClass: 'STANDARD',
        };
        const data = await new Upload({
            client: s3Client,
            params: uploadParams,
        }).done();
        const newTrack = new BackingTrack({
            title: req.body.title || req.file.originalname,
            description: req.body.description || 'No description provided',
            fileUrl: data.Location,
            s3Key: uploadParams.Key,
            price: parseFloat(req.body.price) || 0,
            user: req.userId,
        });
        await newTrack.save();
        const updateUser = await User.findByIdAndUpdate(req.userId, { $push: { uploadedTracks: newTrack._id } }, { new: true });
        if (!updateUser) {
            return res.status(404).json({ message: "User not found." });
        }
        // No need to unlink file since it's not stored on disk
        return res.status(200).json({ message: 'File uploaded successfully!', track: newTrack });
    } catch (error) {
        console.error('Error uploading backing track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};



export const listS3 = async (req, res) => {
    const s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });
    const bucketName = process.env.AWS_BUCKET_NAME;
    try {
        const command = new ListObjectsV2Command({
            Bucket: bucketName
        });
        const data = await s3.send(command);
        const tracks = (data.Contents || []).map(item => ({
            key: item.Key,
            lastModified: item.LastModified,
            size: item.Size
        }));
        res.json(tracks);
    } catch (error) {
        console.error('Error listing backing tracks:', error);
        return res.status(500).json({ error: 'Failed to list backing tracks' });
    }
};

//controller for sorting tracks by popularity amongst other things

//public route
export const queryTracks = async (req, res) => {
    try {
        const { orderBy, page = 1, limit = 10, keySig, "vocal-range": vocalRange } = req.query; //destructuring the page. Because this is my first project, query is a way of getting data from the url. for example.. /tracks?page=1&... e.t.c

        let sort = {};  //define an empty object to hold the sort order
        let filter = {}; // Object to hold the filtering options

        if (orderBy == "popularity") {
            sort = { purchaseCount: -1} //sort by purchase count. -1 for descending. we will add more options later.
        }

        if (orderBy == "date-uploaded") {
            sort = { createdAt: -1};
        }

        if (orderBy == "date-uploaded/ascending") {
            sort = {createdAt: 1};
        }
        //consider arranging all these orderbys into one map

        if (orderBy == "rating") {
            sort = {averageRating: -1};
        }

        if (keySig) {
            try {
                const { key, isFlat, isSharp } = parseKeySignature(keySig);
                filter.key = key;
                if (isFlat) filter.isFlat = true;
                if (isSharp) filter.isSharp = true;
            } catch(error){
                return res.status(400).json({error: error.message}) //may not pass correctly, check this
            }
        };

        if (vocalRange) {
            try {
                filter.vocalRange = vocalRange;
            } catch(error){
                return res.status(400).json({error: "Something went wrong. Make sure you enter valid vocal range"});
            }
        };

        const tracks = await BackingTrack.find(filter).sort(sort).skip((page - 1) * limit).limit(limit); //find tracks with query. Limit searches to ten per page. Make sure to have next-page functionality in front end.
        if (!tracks || tracks.length === 0) {
            return res.status(404).json({message: "No tracks found."}); 
        }

        return res.status(200).json(tracks);
    } catch(error) {
        return res.status(500).json({ error: "Failed to query tracks" }); 
        console.error('Error querying tracks:', error);
    }
};
//controller for querying tracks on my website via name


//public route
export const searchTracks = async (req, res) => {

    try{
    const {query, page = 1} = req.query;


    if (! query){

    return res.status(400).json({message: "search query is required"});
    }

    const limit = 10;
    const skip = (page - 1) * limit; //how many items to skip

    let tracks = await BackingTrack.find({$text: {$search : query}}).sort({score: {$meta: 'textScore'}})
    .skip(skip).limit(limit).select({ score: { $meta: 'textScore' } }); 

     if (!tracks.length) {
      tracks = await BackingTrack.find({
        title: { $regex: query, $options: 'i' }
      })
        .skip(skip)
        .limit(limit);
    }

    return res.status(200).json(tracks);
}catch(error){
    console.error(error);
    return res.status(500).json({message: "server error querying tracks"});
};




}

//delete a track by id
export const deleteTrack = async (req, res) => {
    try {
        const Track = await BackingTrack.findById(req.params.id);
        if (!Track) {
            return res.status(404).json({ message: "Track not found." });
        }
        if (Track.user.toString() !== req.userId) {
            return res.status(403).json({ message: "You are not authorized to delete this track." });
        }
        if (!Track.s3Key) {
            return res.status(400).json({ message: "Track does not have an associated s3Key." });
        }
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const deleteParameters = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: Track.s3Key,
        };
        await User.findByIdAndUpdate(req.userId, { $pull: { uploadedTracks: req.params.id } }, { new: true });
        await s3Client.send(new DeleteObjectCommand(deleteParameters));
        await BackingTrack.findByIdAndDelete(req.params.id);
        return res.status(200).json({ message: 'Track and file deleted' });
    } catch (error) {
        console.error('There was an error deleting track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getTrack = async (req, res) => {
  try {
    if (!req.params.id) {
      return res.status(400).json({ message: 'Please insert a trackId' });
    }
    const track = await BackingTrack.findById(req.params.id);
    if (!track) {
      return res.status(404).json({ message: 'Track not found' });
    }
    return res.status(200).json(track);
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

//get tracks from user
export const getUploadedTracks = async (req, res) => {
    try {
        // Defensive: ensure req.userId is present
        if (!req.userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const tracks = await BackingTrack.find({ user: req.userId }).sort({ createdAt: -1 });
        // Defensive: always return an array
        return res.status(200).json(Array.isArray(tracks) ? tracks : []);
    } catch (error) {
        console.error('Error fetching tracks:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBoughtTracks = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    // Find the user by their ID and populate the 'boughtTracks' array
    const user = await User.findById(req.userId).populate('boughtTracks');
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    // Defensive: ensure boughtTracks is always an array
    const boughtTracks = Array.isArray(user.boughtTracks) ? user.boughtTracks : [];
    if (boughtTracks.length === 0) {
      return res.status(404).json({ message: "No bought tracks found" });
    }
    return res.status(200).json(boughtTracks);
  } catch (error) {
    console.error('Error fetching bought tracks:', error);
    return res.status(500).json({ message: "Failed to fetch bought tracks", error: error.message });
  }
};

export const downloadTrack = async (req, res) => {

try {

    const track = await BackingTrack.findById(req.params.id);
    if (!track) {
        return res.status(404).json({message: "Track not found."});
    }

    const userId = req.userId;

    const user = await User.findById(userId); //find the user wanting to download track

    const hasBought = user.boughtTracks.some(id => id.equals(track._id)); //had to use .some so we can access the .equals method. .includes used strict equality === which is not correct here.
    const hasUploaded = user.uploadedTracks.some(id => id.equals(track._id));

    if (!hasBought && !hasUploaded){
    
        return res.status(403).json({message: "You are not allowed to download this track. Please purchase"})
    }


     const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

          const createParameters = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: track.s3Key,
        };

        const command = new GetObjectCommand(createParameters);
        const data = await s3Client.send(command);
        track.downloadCount += 1;
        await track.save();

        res.setHeader('Content-Type', data.ContentType);
res.setHeader('Content-Disposition', `attachment; filename="${track.title}"`);

data.Body.pipe(res);
return;
    
} catch (error) {

    console.error('Error downloading track:', error);
    return res.status(500).json({ message: 'Internal server error' });



}





}

export const reviewTrack = async(req, res) => {
  try {
    const { review } = req.body;
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({message: "User not found"});
    }
    const track = await BackingTrack.findById(req.params.id);
    if (!track) {
      return res.status(404).json({message: "Track not found"});
    }
    // Check if user has bought the track
    const hasBought = user.boughtTracks.some(id => id.equals(track._id));
    if (!hasBought) {
      return res.status(400).json({ message: "You can only rate tracks you have purchased." });
    }
    // Place your review logic here (e.g., add rating, call calculateAverageRating, save, etc.)
    // ...
  } catch(error) {
    console.error('Error reviewing track:', error);
    return res.status(500).json({message: 'Internal server error'});
  }
}
