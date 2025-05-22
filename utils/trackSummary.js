// utils/trackSummary.js
// Utility to map a list of BackingTrack documents to summary objects

export function toTrackSummary(tracks) {
  return tracks.map(track => ({
    id: track._id,
    title: track.title,
    user: track.user,
    originalArtist: track.originalArtist,
    trackPrice: track.price
  }));
}
