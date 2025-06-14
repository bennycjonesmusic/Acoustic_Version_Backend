// Manual refresh script for Stripe account status
import './db.js';
import User from './models/User.js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function refreshAllStripeAccounts() {
  try {
    const users = await User.find({ 
      stripeAccountId: { $exists: true, $ne: null } 
    });
    
    console.log(`Found ${users.length} users with Stripe accounts`);
    
    for (const user of users) {
      try {
        console.log(`\nRefreshing ${user.email} (${user.stripeAccountId})`);
        
        const account = await stripe.accounts.retrieve(user.stripeAccountId);
        
        const oldStatus = {
          stripeAccountStatus: user.stripeAccountStatus,
          stripePayoutsEnabled: user.stripePayoutsEnabled,
          stripeOnboardingComplete: user.stripeOnboardingComplete
        };
        
        user.stripeAccountStatus = account.charges_enabled ? 'active' : 'pending';
        user.stripePayoutsEnabled = account.payouts_enabled;
        user.stripeOnboardingComplete = account.details_submitted;
        
        await user.save();
        
        console.log('Before:', oldStatus);
        console.log('After: ', {
          stripeAccountStatus: user.stripeAccountStatus,
          stripePayoutsEnabled: user.stripePayoutsEnabled,
          stripeOnboardingComplete: user.stripeOnboardingComplete
        });
        
      } catch (err) {
        console.error(`Error refreshing ${user.email}:`, err.message);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

refreshAllStripeAccounts();
