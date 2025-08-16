// update_stripe_account_statuses.js
// One-time script to update all existing Stripe accounts with the new status fields

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { bulkUpdateStripeAccountStatuses } from './utils/stripeAccountStatus.js';

dotenv.config();

async function main() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Update all existing Stripe accounts
        console.log('Starting bulk update of Stripe account statuses...');
        const results = await bulkUpdateStripeAccountStatuses();

        console.log('\n=== STRIPE ACCOUNT STATUS UPDATE RESULTS ===');
        results.forEach((result, index) => {
            console.log(`\n${index + 1}. User: ${result.email} (${result.userId})`);
            if (result.success) {
                console.log(`   ✅ Status: ${result.stripeAccountStatus}`);
                console.log(`   ✅ Payouts Enabled: ${result.stripePayoutsEnabled}`);
                console.log(`   ✅ Onboarding Complete: ${result.stripeOnboardingComplete}`);
                console.log(`   ℹ️  Charges Enabled: ${result.accountData.charges_enabled}`);
                console.log(`   ℹ️  Payouts Enabled (Stripe): ${result.accountData.payouts_enabled}`);
                if (result.accountData.requirements) {
                    console.log(`   ⚠️  Requirements: ${JSON.stringify(result.accountData.requirements)}`);
                }
            } else {
                console.log(`   ❌ Error: ${result.error}`);
            }
        });

        console.log(`\n=== SUMMARY ===`);
        console.log(`Total accounts processed: ${results.length}`);
        console.log(`Successful updates: ${results.filter(r => r.success).length}`);
        console.log(`Failed updates: ${results.filter(r => r.error).length}`);

        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
        
    } catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    }
}

// Run the script
main();
