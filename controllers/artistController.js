import User from '../models/User.js';
import { createFollowNotification } from '../utils/notificationHelpers.js';
import * as Filter from 'bad-words';
import { validateUserForPayouts } from '../utils/stripeAccountStatus.js';

export const getArtistStorage = async (req, res) => {
try{

  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Check if user is artist
  if (user.role !== 'artist' && user.role !== 'admin') {
    return res.status(403).json({ message: 'Only artists can access storage information' });
  }

  // Helper function to format bytes to human readable format
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return res.status(200).json({
    message: 'Artist storage information retrieved successfully',
    data: {
      storageUsed: user.storageUsed || 0,
      maxStorage: user.maxStorage, // Virtual field from User model
      storageUsagePercentage: user.storageUsagePercentage, // Virtual field from User model
      subscriptionTier: user.subscriptionTier || 'free',
      // Human-readable formats for display
      formatted: {
        storageUsed: formatBytes(user.storageUsed || 0),
        maxStorage: formatBytes(user.maxStorage),
        remaining: formatBytes(user.maxStorage - (user.storageUsed || 0))
      },
      // Storage status indicators
      status: {
        isNearLimit: user.storageUsagePercentage > 80,
        isOverLimit: user.storageUsagePercentage >= 100,
        canUpload: user.storageUsagePercentage < 100
      }
    }
  });

} catch (error) {

  console.error('Error fetching artist storage:', error);
  return res.status(500).json({ message: 'Internal server error' });
}
}

export const getArtistApprovalStatus = async (req, res) => {
try {

  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  if (user.role !== 'artist' && user.role !== 'admin') {
    return res.status(403).json({ message: 'Only artists can check approval status' });
  }

  if (user.profileStatus !== 'approved') {
    return res.status(403).json({ message: 'Your artist profile is not approved yet.' });
  }

  return res.status(200).json({ message: 'Artist is approved. Please continue to route.', status: user.profileStatus });



}catch(error) {

  console.error('Error fetching artist approval status:', error);
  return res.status(500).json({ message: 'Internal server error' });
}


}

export const getArtistStripeStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'artist' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Only artists can check Stripe status' });
    }

    // Use the existing validation function
    const payoutValidation = validateUserForPayouts(user);
    if (!payoutValidation.valid) {
      return res.status(403).json({ 
        message: `Cannot upload tracks: ${payoutValidation.reason}. Please complete your Stripe account setup to enable payouts.`,
        reason: payoutValidation.reason
      });
    }

    return res.status(200).json({ 
      message: 'Stripe account is properly set up for payouts',
      status: 'valid'
    });

  } catch (error) {
    console.error('Error fetching artist Stripe status:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Add a review to an artist
export const addArtistReview = async (req, res) => {
  try {
    const { review } = req.body;
    const artistId = req.params.id;
    if (!review || !review.trim()) {
      return res.status(400).json({ message: 'Review text is required.' });
    }
    // Profanity check using bad-words
    const filter = new Filter.Filter();
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
    }    // Only allow reviews from users who have bought a track or commissioned a track from this artist
    const buyer = await User.findById(req.userId).populate([
      {
        path: 'purchasedTracks.track',
        select: 'user artist' // Only need ownership fields for verification
      },
      {
        path: 'purchasedTracks.commission',
        select: 'artist' // Only need artist for commission verification
      }
    ]);
    // Log the structure of purchasedTracks for debugging
    console.log('[addArtistReview] buyer.purchasedTracks:', JSON.stringify(buyer.purchasedTracks, null, 2));
    const hasPurchased = buyer.purchasedTracks.some(pt => {
      if (pt.refunded) return false;
      // Regular track
      if (pt.track && pt.track.user && pt.track.user.equals(artist._id)) return true;
      // Commission via BackingTrack
      if (pt.track && pt.track.artist && pt.track.artist.equals(artist._id)) return true;
      // Commission via commission field
      if (pt.commission && pt.commission.artist && pt.commission.artist.equals(artist._id)) return true;
      return false;
    });
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
    
    // Populate user data for the response
    await artist.populate({
      path: 'reviews.user',
      select: 'username avatar'
    });
    
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
    
    // Parse pagination parameters
    const { page = 1, limit = 10, orderBy = 'date-added' } = req.query;
    let pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    let limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
    if (limitNum > 50) limitNum = 50; // Cap at 50 reviews per page

    const skip = (pageNum - 1) * limitNum;

    const artist = await User.findById(artistId).populate({
      path: 'reviews.user',
      select: 'username avatar',
    });

     if (!artist || (artist.role !== 'artist' && artist.role !== 'admin')) {
      return res.status(404).json({ message: 'Artist not found.' });
    }

    // Sort reviews based on orderBy parameter
    let sortedReviews = [...artist.reviews];
    if (orderBy === 'date-added') {
      sortedReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Newest first
    } else if (orderBy === 'date-added/ascending') {
      sortedReviews.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // Oldest first
    }

    // Apply pagination
    const totalReviews = sortedReviews.length;
    const paginatedReviews = sortedReviews.slice(skip, skip + limitNum);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalReviews / limitNum);

    return res.status(200).json({ 
      reviews: paginatedReviews, 
      numOfReviews: artist.numOfReviews,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalReviews: totalReviews,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const followArtist = async (req, res) => {
  try {
    const artistId = req.params.id;
    
    // Validate artistId format
    if (!artistId || !artistId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid artist ID" });
    }

    const user = await User.findById(req.userId);
    const artist = await User.findById(artistId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!artist) {
      return res.status(404).json({ message: "Artist not found" });
    }

    // Prevent users from following themselves
    if (user._id.equals(artist._id)) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    // Only allow following artists or admins
    if (artist.role !== 'artist' && artist.role !== 'admin') {
      return res.status(400).json({ message: "You can only follow artists" });
    }

    // Check if already following
    if (user.following.includes(artistId)) {
      return res.status(400).json({ message: "You are already following this artist" });
    }    // Add to following/followers arrays
    user.following.push(artistId);
    artist.followers.push(user._id || user.id);
    artist.amountOfFollowers = artist.followers.length; // Use correct field name

    await user.save();
    await artist.save();

    // Create notification for the artist being followed
    try {
      // Defensive coding: handle both _id and id fields
      const followerId = user._id || user.id;
      if (followerId) {
        await createFollowNotification(artistId, followerId, user.username);
      } else {
        console.error('Could not create follow notification: missing user ID');
      }
    } catch (notificationError) {
      console.error('Error creating follow notification:', notificationError);
      // Don't fail the follow operation if notification fails
    }

    return res.status(200).json({ 
      message: "Successfully followed artist", 
      following: user.following, 
      followers: artist.followers, 
      amountOfFollowers: artist.amountOfFollowers 
    });

  } catch(error) {
    console.error('Error following artist:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export const unfollowArtist = async (req, res) => {
  try {
    const artistId = req.params.id;
    
    // Validate artistId format
    if (!artistId || !artistId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid artist ID" });
    }

    const user = await User.findById(req.userId);
    const artist = await User.findById(artistId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!artist) {
      return res.status(404).json({ message: "Artist not found" });
    }

    // Check if user is actually following the artist
    const followingIndex = user.following.findIndex(id => id.equals(artistId));
    if (followingIndex === -1) {
      return res.status(400).json({ message: "You are not following this artist" });
    }

    const followerIndex = artist.followers.findIndex(id => id.equals(user._id));
    if (followerIndex === -1) {
      return res.status(400).json({ message: "Artist is not followed by you" });
    }

    // Remove from following/followers arrays
    user.following.splice(followingIndex, 1);
    artist.followers.splice(followerIndex, 1);
    artist.amountOfFollowers = artist.followers.length; // Use correct field name

    await user.save();
    await artist.save();

    return res.status(200).json({ 
      message: "Successfully unfollowed artist", 
      following: user.following, 
      followers: artist.followers, 
      amountOfFollowers: artist.amountOfFollowers 
    });

  } catch (error) {
    console.error('Error unfollowing artist:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export const getArtistFollowers = async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'followers',
      select: 'username'
    });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Followers retrieved successfully",
      followers: user.followers || [],
    });
  } catch (error) {
    console.error('Error getting followers:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getUserFollowing = async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'following',
      select: 'username'
    });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Following retrieved successfully",
      following: user.following || [],
    });
  } catch (error) {
    console.error('Error getting following:', error);
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


 export const sortUploadedOrPurchasedTracks = async (req, res) => {
  try {
    const { uploadedOrder = 'recent', purchasedOrder = 'recent' } = req.query;
    const user = await User.findById(req.userId)
      .populate({
        path: 'uploadedTracks',
        select: 'title price customerPrice averageRating numOfRatings previewUrl createdAt purchaseCount originalArtist backingTrackType genre'
      })
      .populate({
        path: 'purchasedTracks.track',
        select: 'title price customerPrice averageRating numOfRatings previewUrl createdAt originalArtist backingTrackType genre user',
        populate: {
          path: 'user',
          select: 'username avatar'
        }
      });
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
    const user = await User.findById(req.params.id)
      .populate({
        path: 'uploadedTracks',
        select: 'title price customerPrice averageRating numOfRatings previewUrl createdAt purchaseCount originalArtist backingTrackType genre'
      });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.status(200).json({ tracks: user.uploadedTracks || [] });
  } catch (error) {
    console.error('Error fetching uploaded tracks by user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

