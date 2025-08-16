#!/usr/bin/env node

/**
 * Test Cart Purchase Fast Payout Demo
 * 
 * This script demonstrates the new fast payout system for cart purchases.
 * When you make a cart purchase in development mode, payouts are triggered
 * automatically 30 seconds after the purchase instead of waiting for the 
 * regular 2-minute cron job.
 * 
 * Features:
 * - Cart purchases trigger payouts in 30 seconds (development only)
 * - Single track purchases still use instant Stripe splits (unchanged)
 * - Production uses hourly cron jobs (safe and reliable)
 * - Manual trigger endpoint still available: POST /stripe/trigger-payouts
 */

import mongoose from 'mongoose';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function demonstrateFastPayoutFlow() {
    try {
        console.log('🚀 Cart Purchase Fast Payout Demo\n');
        
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        // Check for users with money owed
        const usersWithMoneyOwed = await User.find({ 
            'moneyOwed.0': { $exists: true } 
        }).select('displayName email moneyOwed');
        
        console.log(`\n📊 Current Status:`);
        console.log(`   Users with pending payouts: ${usersWithMoneyOwed.length}`);
        
        if (usersWithMoneyOwed.length > 0) {
            console.log('\n💰 Pending Payouts:');
            for (const user of usersWithMoneyOwed) {
                const totalOwed = user.moneyOwed.reduce((sum, owed) => sum + owed.amount, 0);
                console.log(`   • ${user.displayName || user.email}: £${totalOwed.toFixed(2)} (${user.moneyOwed.length} entries)`);
                
                // Show recent cart purchases
                const cartPurchases = user.moneyOwed.filter(m => m.source === 'cart_purchase');
                if (cartPurchases.length > 0) {
                    console.log(`     Recent cart purchases: ${cartPurchases.length}`);
                }
            }
        } else {
            console.log('   No pending payouts found');
        }
        
        console.log('\n🔄 Fast Payout Flow:');
        console.log('   1. Customer makes cart purchase');
        console.log('   2. Webhook adds money to artists\' moneyOwed arrays');
        console.log('   3. 🚀 FAST: Payout automatically triggered in 30 seconds (dev mode)');
        console.log('   4. Artists receive payments via Stripe transfers');
        console.log('   5. Successful payouts removed from moneyOwed');
        
        console.log('\n⚡ Testing Instructions:');
        console.log('   1. Make sure NODE_ENV is NOT set to "production"');
        console.log('   2. Start your server: npm start');
        console.log('   3. Make a cart purchase (multiple tracks)');
        console.log('   4. Watch server logs for "[FAST PAYOUT]" messages');
        console.log('   5. Payouts will be processed automatically in 30 seconds');
        
        console.log('\n🛠️  Manual Testing:');
        console.log('   • Manual trigger: POST /stripe/trigger-payouts');
        console.log('   • Check this status: node test_fast_payout_demo.js');
        
        console.log('\n🏭 Production Mode:');
        console.log('   • Fast payouts disabled in production');
        console.log('   • Uses reliable hourly cron jobs');
        console.log('   • Safer for high-volume operations');
        
        mongoose.disconnect();
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateFastPayoutFlow();
}

export { demonstrateFastPayoutFlow };
