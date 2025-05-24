import User from '../models/User.js';
import profanity from 'profanity-util';

// Add a review to an artist
export const addArtistReview = async (req, res) => {
  try {
    const { review } = req.body;
    const artistId = req.params.id;
    if (!review || !review.trim()) {
      return res.status(400).json({ message: 'Review text is required.' });
    }
    // Optionally, check for profanity
    if (profanity.isProfane(review)) {
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
