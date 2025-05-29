import User from '../models/User.js';
import * as Filter from 'bad-words';

// Add a review to an artist
export const addArtistReview = async (req, res) => {
  try {
    const { review } = req.body;
    const artistId = req.params.id;
    if (!review || !review.trim()) {
      return res.status(400).json({ message: 'Review text is required.' });
    }
    // Profanity check using bad-words
    const filter = new Filter();
    if (filter.isProfane(review)) {
      return res.status(400).json({ message: 'Please avoid profanity in your review.' });
    }
    const artist = await User.findById(artistId);
    if (!artist || (artist.role !== 'artist' && artist.role !== 'admin')) {
      return res.status(404).json({ message: 'Artist not found.' });
    }
    // Optionally, prevent self-review
    if (artist._id.equals(req.userId)) {
      return res.status(400).json({ message: 'You cannot review yourself.' });
    }
    // Only allow reviews from users who have bought a track from this artist
    const buyer = await User.findById(req.userId).populate('purchasedTracks.track');
    const hasPurchased = buyer.purchasedTracks.some(pt => pt.track && pt.track.user && pt.track.user.equals(artist._id) && !pt.refunded);
    if (!hasPurchased) {
      return res.status(403).json({ message: 'You can only review artists you have purchased from.' });
    }
    // Prevent multiple reviews from the same user
    const alreadyReviewed = artist.reviews.some(r => r.user && r.user.equals(req.userId));
    if (alreadyReviewed) {
      return res.status(400).json({ message: 'You have already reviewed this artist.' });
    }
    // Add review
    artist.reviews.push({
      user: req.userId,
      text: review,
      createdAt: new Date()
    });
    artist.numOfReviews = artist.reviews.length;
    await artist.save();
    return res.status(200).json({ message: 'Review added successfully', reviews: artist.reviews, numOfReviews: artist.numOfReviews });
  } catch (error) {
    console.error('Error adding review:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all reviews for an artist
export const getArtistReviews = async (req, res) => {
  try {
    const artistId = req.params.id;
    const artist = await User.findById(artistId).populate({
      path: 'reviews.user',
      select: 'username avatar',
    });
    if (!artist || (artist.role !== 'artist' && artist.role !== 'admin')) {
      return res.status(404).json({ message: 'Artist not found.' });
    }
    return res.status(200).json({ reviews: artist.reviews, numOfReviews: artist.numOfReviews });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const followArtist = async (req, res) => {

  try {

    const artistId = req.params.id;
    const artist = await User.findById(artistId);
    const user = await User.findById(req.userId);




 if (!user) {
  console.error('User not found:', req.userId);
    return res.status(404).json({ message: "User not found" });
 }

 if (user.following.includes(artistId)) {
    return res.status(400).json({ message: "You are already following this artist" });
 }

 user.following.push(artistId);
 artist.followers.push(user._id);
 artist.numOfFollowers = artist.followers.length;
 await user.save();
 await artist.save();
 return res.status(200).json({ message: "Successfully followed artist", following: user.following, followers: artist.followers, numOfFollowers: artist.numOfFollowers });


  
}
  catch(error) {

    console.error('Error following artist:', error);
    return res.status(500).json({ message: 'Internal server error' });

  }
 
}



export const deleteArtistReview = async (req, res) => {
  
  try {

    const artist = await User.findById(req.params.id);
    if (! artist){
      return res.status(404).json({message: "Artist cannot be found"});
    }

    const reviewIndex = artist.reviews.findIndex(r => r.user && r.user.equals(req.userId));
    if (reviewIndex === -1) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    artist.reviews.splice(reviewIndex, 1);
    artist.numOfReviews = artist.reviews.length;
    await artist.save();
    return res.status(200).json({ message: "Review has been deleted successfully", reviews: artist.reviews, numOfReviews: artist.numOfReviews });


  } catch (error) {


    return res.status(500).json({ message: "Internal server error" });




  }


 





}



 export const sortUploadedOrPurchasedTracks = async (req, res) => {
  try {
    const { uploadedOrder = 'recent', purchasedOrder = 'recent' } = req.query;
    const user = await User.findById(req.userId)
      .populate('uploadedTracks')
      .populate('purchasedTracks.track');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    // Sort uploaded tracks
    if (uploadedOrder === 'popularity') {
      user.uploadedTracks.sort((a, b) => (b.purchaseCount || 0) - (a.purchaseCount || 0));
    } else if (uploadedOrder === 'alphabetical') {
      user.uploadedTracks.sort((a, b) => a.title.localeCompare(b.title));
    } else { // 'recent' or default
      user.uploadedTracks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    // Sort purchased tracks
    if (purchasedOrder === 'alphabetical') {
      user.purchasedTracks.sort((a, b) => {
        if (!a.track || !b.track) return 0;
        return a.track.title.localeCompare(b.track.title);
      });
    } else { // 'recent' or default
      user.purchasedTracks.sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
    }
    return res.status(200).json({
      uploadedTracks: user.uploadedTracks,
      purchasedTracks: user.purchasedTracks,
    });
  } catch (error) {
    console.error('Error sorting tracks:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all tracks uploaded by a specific user (artist)
export const getUploadedTracksByUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('uploadedTracks');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.status(200).json({ tracks: user.uploadedTracks || [] });
  } catch (error) {
    console.error('Error fetching uploaded tracks by user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

