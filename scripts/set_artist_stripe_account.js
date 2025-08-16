// set_artist_stripe_account.js
import User from './models/User.js';
import mongoose from 'mongoose';

export async function setArtistStripeAccount() {
  // Find the artist by email instead of hardcoded _id
  const artistEmail = 'sarahandbenduo@gmail.com';
  const stripeAccountId = 'acct_1RTB1bCRMWHPkR1y';
  const user = await User.findOne({ email: { $regex: new RegExp('^' + artistEmail + '$', 'i') } });  if (user) {
    user.stripeAccountId = stripeAccountId;
    user.stripeAccountStatus = 'active';
    user.stripePayoutsEnabled = true;
    user.stripeOnboardingComplete = true;
    await user.save();
    console.log(`Set stripeAccountId for user ${user._id} (${user.email}) to ${stripeAccountId}`);
    console.log(`Set Stripe status fields: status=active, payouts=true, onboarding=true`);
  } else {
    console.log(`User with email ${artistEmail} not found.`);
  }
}

// Optional: allow CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  import('dotenv').then(async ({ default: dotenv }) => {
    dotenv.config();
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/backing-tracks';
    await mongoose.connect(MONGO_URI);
    await setArtistStripeAccount();
    await mongoose.disconnect();
  });
}
