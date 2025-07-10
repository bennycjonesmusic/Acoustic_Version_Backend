// utils/trackSummary.js
// Utility to map a list of BackingTrack documents to summary objects

// Helper to calculate customer price for tracks (same formula as commissions)
function calculateCustomerPrice(artistPrice) {
  const platformCommissionRate = 0.10; // 10% platform fee
  const stripeProcessingFee = 0.20; // 20p Stripe processing fee
  if (typeof artistPrice === 'number' && artistPrice > 0) {
    const platformFee = artistPrice * platformCommissionRate;
    return Math.round((artistPrice + platformFee + stripeProcessingFee) * 100) / 100;
  }
  return 0;
}

export function toTrackSummary(tracks) {
  try {    console.log('[toTrackSummary] Input:', JSON.stringify(tracks, null, 2));
    return tracks.map(track => ({
      id: track.id || track._id, // Defensive handling for both id formats
      title: track.title,
      createdAt: track.createdAt, // Add createdAt field for date display
      averageRating: track.averageRating,
      numOfRatings: track.numOfRatings,
      user: track.user && track.user.username ? {
        id: track.user.id || track.user._id, // Defensive handling for user ID
        username: track.user.username,
        avatar: track.user.avatar,
        
         } : track.user, // fallback to ObjectId if not populated
      originalArtist: track.originalArtist,
      customerPrice: track.customerPrice || calculateCustomerPrice(track.price), // Calculate if missing
      previewUrl: track.previewUrl,
      guideTrackUrl: track.guideTrackUrl,
      youtubeGuideUrl: track.youtubeGuideUrl,
      backingTrackType: track.backingTrackType, // Add backing track type for dynamic display
      // Key signature fields for SEO enhancement
      key: track.key,
      isFlat: track.isFlat,
      isSharp: track.isSharp,
      isMajor: track.isMajor,
      isMinor: track.isMinor,
      isHigher: track.isHigher,
      isLower: track.isLower,
      vocalRange: track.vocalRange // Added vocal range to track summary
    }));
    
  } catch (error) {
    console.error('Error mapping tracks to summary:', error, '\nInput:', JSON.stringify(tracks, null, 2));
    throw error;
  }
}
