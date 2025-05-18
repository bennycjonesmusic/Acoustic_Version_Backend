import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import BackingTrack from '../models/backing_track.js';
import { parseKeySignature } from './utils';  

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
