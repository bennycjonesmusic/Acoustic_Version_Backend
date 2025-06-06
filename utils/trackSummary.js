// utils/trackSummary.js
// Utility to map a list of BackingTrack documents to summary objects

export function toTrackSummary(tracks) {
  try {
    console.log('[toTrackSummary] Input:', JSON.stringify(tracks, null, 2));    return tracks.map(track => ({
      id: track._id,
      title: track.title,
      averageRating: track.averageRating,
      numOfRatings: track.numOfRatings,
      user: track.user && track.user.username ? {
        id: track.user._id,
        username: track.user.username,
        avatar: track.user.avatar,
        
         } : track.user, // fallback to ObjectId if not populated
      originalArtist: track.originalArtist,
      customerPrice: track.customerPrice || track.price, // Use customerPrice if available, fallback to price
      previewUrl: track.previewUrl,
      guideTrackUrl: track.guideTrackUrl,
      youtubeGuideUrl: track.youtubeGuideUrl
    }));
    
  } catch (error) {
    console.error('Error mapping tracks to summary:', error, '\nInput:', JSON.stringify(tracks, null, 2));
    throw error;
  }
}
