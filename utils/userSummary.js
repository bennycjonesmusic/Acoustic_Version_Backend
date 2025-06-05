// utils/userSummary.js
// Utility to map a list of User documents to summary objects

export function toUserSummary(users) {
  return users.map(user => ({
    id: user._id,
    username: user.username,
    avatar: user.avatar,
    customerCommissionPrice: user.customerCommissionPrice,  // Fixed spelling to match frontend interface
    averageTrackRating: user.averageTrackRating,
    artistExample: user.artistExamples && user.artistExamples.length > 0 ? user.artistExamples[0].url : null
 
  }));
}
