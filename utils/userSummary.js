// utils/userSummary.js
// Utility to map a list of User documents to summary objects

export function toUserSummary(users) {
  return users.map(user => ({
    id: user.id || user._id, // Defensive handling for both id formats
    username: user.username,
    avatar: user.avatar,
    customerCommissionPrice: user.customerCommissionPrice,  // Fixed spelling to match frontend interface
    averageTrackRating: user.averageTrackRating,
    artistExample: user.artistExamples && user.artistExamples.length > 0 ? user.artistExamples[0].url : null,
    maxTimeTakenForCommission: user.maxTimeTakenForCommission,
    averageCommissionCompletionTime: user.averageCommissionCompletionTime,
    averageCommissionCompletionTimeHours: user.averageCommissionCompletionTimeHours, // <-- Ensure this is included
    numOfCommissions: user.numOfCommissions,
    artistInstrument: user.artistInstrument,
    numOfRatings: user.numOfRatings, // Add total ratings to summary for frontend
    commissionPrice: user.commissionPrice, // Add commissionPrice for frontend calculations
  }));
}
