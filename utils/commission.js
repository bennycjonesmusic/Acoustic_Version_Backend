// Utility to get commission rate for a user
export function getCommissionRateForUser(user) {
  if (!user || !user.subscriptionTier) return 0.10; // Changed to 10%
  return user.subscriptionTier === 'enterprise' ? 0.04 : 0.10; // Changed to 10%
}

// Calculate customer price including commission + stripe fee
export function calculateCustomerPrice(artistPrice) {
  if (typeof artistPrice !== 'number' || artistPrice <= 0) return 0;
  
  // 10% platform commission
  const commission = Math.round(artistPrice * 0.10 * 100) / 100;
  
  // Add 20p Stripe fee
  const stripeFee = 0.20;
  
  // Total customer price = artist price + commission + stripe fee
  const totalPrice = artistPrice + commission + stripeFee;
  
  return Math.round(totalPrice * 100) / 100; // Round to 2 decimal places
}
