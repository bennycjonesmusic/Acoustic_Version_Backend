// utils/trackSummary.js
// Utility to map a list of BackingTrack documents to summary objects

export function toTrackSummary(tracks) {
  return tracks.map(track => ({
    id: track._id,
    title: track.title,
    user: track.user && track.user.username ? {
      id: track.user._id,
      username: track.user.username,
      avatar: track.user.avatar
    } : track.user, // fallback to ObjectId if not populated
    originalArtist: track.originalArtist,
    trackPrice: track.price
  }));
}
