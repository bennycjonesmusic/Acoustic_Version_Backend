// test_stripe_status_update.js
// Test script to verify Stripe status field updates work correctly

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import { updateUserStripeAccountStatus, validateUserForPayouts } from './utils/stripeAccountStatus.js';

dotenv.config();

async function testStripeStatusUpdate() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find a user with a Stripe account for testing
        const userWithStripeAccount = await User.findOne({ 
            stripeAccountId: { $exists: true, $ne: null } 
        });

        if (!userWithStripeAccount) {
            console.log('❌ No users with Stripe accounts found for testing');
            await mongoose.disconnect();
            return;
        }

        console.log(`\n🧪 Testing with user: ${userWithStripeAccount.email}`);
        console.log(`   Stripe Account ID: ${userWithStripeAccount.stripeAccountId}`);

        // Show current status
        console.log('\n📊 Current Status:');
        console.log(`   Account Status: ${userWithStripeAccount.stripeAccountStatus}`);
        console.log(`   Payouts Enabled: ${userWithStripeAccount.stripePayoutsEnabled}`);
        console.log(`   Onboarding Complete: ${userWithStripeAccount.stripeOnboardingComplete}`);

        // Test validation function
        console.log('\n🔍 Payout Validation:');
        const validation = validateUserForPayouts(userWithStripeAccount);
        console.log(`   Valid for payouts: ${validation.valid}`);
        if (!validation.valid) {
            console.log(`   Reason: ${validation.reason}`);
        }

        // Test status update (comment this out if you don't want to hit Stripe API)
        console.log('\n🔄 Testing status update from Stripe...');
        const updateResult = await updateUserStripeAccountStatus(userWithStripeAccount._id);
        
        if (updateResult.success) {
            console.log('✅ Status update successful:');
            console.log(`   Account Status: ${updateResult.stripeAccountStatus}`);
            console.log(`   Payouts Enabled: ${updateResult.stripePayoutsEnabled}`);
            console.log(`   Onboarding Complete: ${updateResult.stripeOnboardingComplete}`);
            
            // Test validation again after update
            const updatedUser = await User.findById(userWithStripeAccount._id);
            const newValidation = validateUserForPayouts(updatedUser);
            console.log(`\n🔍 Updated Payout Validation:`);
            console.log(`   Valid for payouts: ${newValidation.valid}`);
            if (!newValidation.valid) {
                console.log(`   Reason: ${newValidation.reason}`);
            }
        } else {
            console.log(`❌ Status update failed: ${updateResult.error}`);
        }

        await mongoose.disconnect();
        console.log('\n✅ Test completed, disconnected from MongoDB');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testStripeStatusUpdate();
}

export { testStripeStatusUpdate };
