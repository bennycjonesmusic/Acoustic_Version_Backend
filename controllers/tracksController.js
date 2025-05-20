import fs from 'fs'; // for reading & deleting temp files
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage'; // for streaming uploads to S3
import BackingTrack from '../models/backing_track.js';
import User from '../models/User.js'; // assuming you’re using user logic
import { parseKeySignature } from '../utils/parseKeySignature.js';




export const uploadTrack = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const fileStream = fs.createReadStream(req.file.path);
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
             StorageClass: 'STANDARD', //added because download speed seemed somewhat slow
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
        fs.unlinkSync(req.file.path);
        res.status(200).json({ message: 'File uploaded successfully!', track: newTrack });
    } catch (error) {
        console.error('Error uploading backing track:', error);
        res.status(500).json({ message: 'Internal server error' });
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
        res.status(500).json({ error: 'Failed to list backing tracks' });
    }
};

//controller for sorting tracks by popularity amongst other things
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

        res.status(200).json(tracks);
    } catch(error) {
        res.status(500).json({ error: "Failed to query tracks" }); 
        console.error('Error querying tracks:', error);
    }
};
//controller for querying tracks on my website via name

export const searchTracks = async (req, res) => {

    try{
    const {query, page = 1} = req.query;


    if (! query){

    return res.status(400).json({message: "search query is required"});
    }

    const limit = 10;
    const skip = (page - 1) * limit; //how many items to skip

    const tracks = await BackingTrack.find({$text: {$search : query}}).sort({score: {$meta: 'textScore'}})
    .skip(skip).limit(limit).select({ score: { $meta: 'textScore' } }); ;

    res.status(200).json(tracks);
}catch(error){

    res.status(500).json({message: "server error querying tracks"});
};




}

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
        res.status(200).json({ message: 'Track and file deleted' });
    } catch (error) {
        console.error('There was an error deleting track:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getTracks = async (req, res) => {
    try {
        const tracks = await BackingTrack.find({ user: req.userId }).sort({ createdAt: -1 });
        res.status(200).json(tracks);
    } catch (error) {
        console.error('Error fetching tracks:', error);
        res.status(500).json({ message: 'Internal server error' });
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

    
} catch (error) {

    console.error('Error downloading track:', error);
    res.status(500).json({ message: 'Internal server error' });



}





}
