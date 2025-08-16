import stripe from 'stripe';
import User from './models/User.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

async function testStripeStatus() {
    try {
        // Connect to database
        await mongoose.connect(process.env.DB_URL);
        console.log('Connected to database');

        // Find users with Stripe accounts
        const users = await User.find({ stripeAccountId: { $exists: true, $ne: null } })
            .select('email stripeAccountId stripeAccountStatus stripePayoutsEnabled stripeOnboardingComplete');

        console.log('\n=== Users with Stripe Accounts ===');
        
        for (const user of users) {
            console.log(`\nUser: ${user.email}`);
            console.log(`Account ID: ${user.stripeAccountId}`);
            console.log(`DB Status: ${user.stripeAccountStatus}`);
            console.log(`DB Payouts: ${user.stripePayoutsEnabled}`);
            console.log(`DB Onboarding: ${user.stripeOnboardingComplete}`);
            
            try {
                // Get real status from Stripe
                const account = await stripeClient.accounts.retrieve(user.stripeAccountId);
                
                console.log('\n--- STRIPE API RESPONSE ---');
                console.log(`charges_enabled: ${account.charges_enabled}`);
                console.log(`payouts_enabled: ${account.payouts_enabled}`);
                console.log(`details_submitted: ${account.details_submitted}`);
                console.log(`requirements.currently_due: ${JSON.stringify(account.requirements.currently_due)}`);
                console.log(`requirements.disabled_reason: ${account.requirements.disabled_reason}`);
                
                // Show what the status should be
                const shouldBeActive = account.charges_enabled;
                console.log(`\nShould be ACTIVE: ${shouldBeActive}`);
                
                if (shouldBeActive && user.stripeAccountStatus !== 'active') {
                    console.log('⚠️  DATABASE OUT OF SYNC - Should update to active!');
                }
                
            } catch (stripeError) {
                console.log(`❌ Error fetching from Stripe: ${stripeError.message}`);
            }
            
            console.log('\n' + '='.repeat(50));
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from database');
    }
}

testStripeStatus();
