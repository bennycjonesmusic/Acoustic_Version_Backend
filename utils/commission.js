// Utility to get commission rate for a user
export function getCommissionRateForUser(user) {
  if (!user || !user.subscriptionTier) return 0.12; // default to 12%
  return user.subscriptionTier === 'enterprise' ? 0.04 : 0.12;
}
