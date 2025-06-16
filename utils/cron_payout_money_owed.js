import dotenv from 'dotenv';
import mongoose from 'mongoose';
import stripe from 'stripe';
import User from '../models/User.js';
import CommissionRequest from '../models/CommissionRequest.js';

dotenv.config();

const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[CRON PAYOUT] Connected to MongoDB');
  } catch (error) {
    console.error('[CRON PAYOUT] MongoDB connection error:', error);
    process.exit(1);
  }
}

// Process money owed payouts
async function processPayouts() {
  try {
    console.log('[CRON PAYOUT] Starting automatic payout process...');
    
    // Run cleanup every 24 hours (check if it's been a day since last cleanup)
    const now = new Date();
    const lastCleanupKey = 'lastMoneyOwedCleanup';
    
    // Simple check: run cleanup if hour is 0-1 (midnight to 1 AM) and we haven't run today
    if (now.getHours() <= 1) {
      const today = now.toDateString();
      if (!global[lastCleanupKey] || global[lastCleanupKey] !== today) {
        await cleanupStaleMoneyOwed();
        global[lastCleanupKey] = today;
      }
    }
    
    // Check platform's Stripe balance first - only payout if we have the money
    const balance = await stripeClient.balance.retrieve();
    console.log(balance);
    const availableBalance = balance.available[0]?.amount || 0; // in pence
    const pendingBalance = balance.pending[0]?.amount || 0; // in pence
    
    console.log(`[CRON PAYOUT] Platform Stripe balance: Available £${(availableBalance / 100).toFixed(2)}, Pending £${(pendingBalance / 100).toFixed(2)}`);
    
    if (availableBalance <= 0) {
      console.log('[CRON PAYOUT] ⚠️  No available balance - skipping payouts');
      return;
    }
    
    // Note: When called from server.js, we use the existing DB connection
    // Only connect if this script is run standalone
    
    // Find all users with money owed who have valid Stripe accounts
    const usersWithMoneyOwed = await User.find({
      'moneyOwed.0': { $exists: true }, // Has at least one money owed entry
      stripeAccountId: { $exists: true, $ne: null },
      stripePayoutsEnabled: true
    });

    console.log(`[CRON PAYOUT] Found ${usersWithMoneyOwed.length} users with money owed`);

    // Calculate total money owed
    let totalOwedAmount = 0;
    for (const user of usersWithMoneyOwed) {
      for (const owed of user.moneyOwed) {
        totalOwedAmount += Math.round(owed.amount * 100); // Convert to pence
      }
    }
    
    console.log(`[CRON PAYOUT] Total money owed: £${(totalOwedAmount / 100).toFixed(2)}`);
    
    if (totalOwedAmount > availableBalance) {
      console.log(`[CRON PAYOUT] ⚠️  Not enough balance to pay all owed money (need £${(totalOwedAmount / 100).toFixed(2)}, have £${(availableBalance / 100).toFixed(2)})`);
      console.log('[CRON PAYOUT] Will attempt partial payouts in order...');
    }

    let totalProcessed = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;
    let remainingBalance = availableBalance;

    for (const user of usersWithMoneyOwed) {
      console.log(`[CRON PAYOUT] Processing payouts for user ${user.email} (${user._id})`);
      
      // Process each money owed entry
      const remainingOwed = [];
      
      for (const owed of user.moneyOwed) {
        totalProcessed++;
        
        try {
          // Convert to pence for Stripe
          const transferAmount = Math.round(owed.amount * 100);
          
          if (transferAmount <= 0) {
            console.log(`[CRON PAYOUT] Skipping zero/negative amount: £${owed.amount}`);
            continue;
          }

          // Check if we have enough balance for this transfer
          if (transferAmount > remainingBalance) {
            console.log(`[CRON PAYOUT] ⚠️  Insufficient balance for £${owed.amount} transfer to ${user.email} (need ${transferAmount} pence, have ${remainingBalance} pence)`);
            console.log(`[CRON PAYOUT] Keeping this payment for next time when balance is sufficient`);
            totalFailed++;
            remainingOwed.push(owed);
            continue;
          }          // Create transfer to artist
          const transfer = await stripeClient.transfers.create({
            amount: transferAmount,
            currency: 'gbp',
            destination: user.stripeAccountId,
            description: owed.reference,
            metadata: {
              artistId: user._id.toString(),
              source: owed.source,
              originalAmount: owed.amount.toString(),
              createdAt: owed.createdAt.toISOString(),
              // Ensure all metadata values are strings for Stripe
              ...Object.fromEntries(
                Object.entries(owed.metadata || {}).map(([key, value]) => [
                  key, 
                  typeof value === 'string' ? value : JSON.stringify(value)
                ])
              )
            }
          });console.log(`[CRON PAYOUT] ✅ Successfully transferred £${owed.amount} to ${user.email}: ${owed.reference}`);
          console.log(`[CRON PAYOUT] Transfer ID: ${transfer.id}`);
            // If this was a commission payout, update the commission status
          if (owed.source === 'commission' && owed.commissionId) {
            try {
              const commission = await CommissionRequest.findById(owed.commissionId);
              if (commission) {
                if (commission.status === 'cron_pending') {
                  commission.status = 'completed';
                  commission.stripeTransferId = transfer.id;
                  await commission.save();
                  console.log(`[CRON PAYOUT] ✅ Updated commission ${owed.commissionId} status to 'completed'`);
                } else {
                  console.log(`[CRON PAYOUT] ⚠️  Commission ${owed.commissionId} not in 'cron_pending' status (current: '${commission.status}'), payout successful but status not updated`);
                }
              } else {
                console.error(`[CRON PAYOUT] ⚠️  Commission ${owed.commissionId} not found, payout successful but commission doesn't exist`);
              }
            } catch (commissionError) {
              console.error(`[CRON PAYOUT] ⚠️  Failed to update commission ${owed.commissionId} status:`, commissionError.message);
              // Don't fail the entire payout for this - the money was transferred successfully
            }
          }
          
          // Deduct from our remaining balance
          remainingBalance -= transferAmount;
          totalSuccessful++;
          
          // Don't add to remainingOwed - this payout was successful
          
        } catch (error) {
          console.error(`[CRON PAYOUT] ❌ Failed to transfer £${owed.amount} to ${user.email}:`, error.message);
          console.error(`[CRON PAYOUT] Reference: ${owed.reference}`);
          
          totalFailed++;
          
          // Keep this entry for next retry
          remainingOwed.push(owed);
        }
      }

      // Update user with only the failed/remaining payouts
      user.moneyOwed = remainingOwed;
      await user.save();
      
      if (remainingOwed.length === 0) {
        console.log(`[CRON PAYOUT] ✅ All payouts completed for ${user.email}`);
      } else {
        console.log(`[CRON PAYOUT] ⚠️  ${remainingOwed.length} payouts still pending for ${user.email}`);
      }
    }

    console.log('[CRON PAYOUT] Payout process completed:');
    console.log(`[CRON PAYOUT] - Total processed: ${totalProcessed}`);
    console.log(`[CRON PAYOUT] - Successful: ${totalSuccessful}`);
    console.log(`[CRON PAYOUT] - Failed: ${totalFailed}`);
    
    if (totalFailed > 0) {
      console.log(`[CRON PAYOUT] ⚠️  ${totalFailed} payouts failed and will be retried next time`);
    }

  } catch (error) {
    console.error('[CRON PAYOUT] Error in payout process:', error);
  }
}

/**
 * Clean up stale money owed entries
 * Removes entries that are:
 * - Older than 30 days and have failed multiple times
 * - Have invalid/corrupted data
 * - Are duplicates based on metadata
 */
async function cleanupStaleMoneyOwed() {
  try {
    console.log('[CLEANUP] Starting cleanup of stale money owed entries...');
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const users = await User.find({ 
      'moneyOwed.0': { $exists: true } 
    });
    
    let totalCleaned = 0;
    let totalUsers = 0;
    
    for (const user of users) {
      const originalCount = user.moneyOwed.length;
      
      // Filter out stale entries
      user.moneyOwed = user.moneyOwed.filter(owed => {
        // Keep if entry is recent (less than 30 days old)
        if (owed.createdAt && owed.createdAt > thirtyDaysAgo) {
          return true;
        }
        
        // Keep if amount is valid and reasonable (> 0 and < £10000)
        if (!owed.amount || owed.amount <= 0 || owed.amount > 10000) {
          console.log(`[CLEANUP] Removing invalid amount entry: £${owed.amount} for ${user.email}`);
          return false;
        }
        
        // Keep if has valid source
        if (!owed.source || !['cart_purchase', 'commission', 'manual'].includes(owed.source)) {
          console.log(`[CLEANUP] Removing invalid source entry: ${owed.source} for ${user.email}`);
          return false;
        }
        
        // If older than 30 days, log but keep for manual review
        if (owed.createdAt && owed.createdAt <= thirtyDaysAgo) {
          console.log(`[CLEANUP] ⚠️  Old entry found (${owed.createdAt}): £${owed.amount} for ${user.email} - keeping for manual review`);
          return true;
        }
        
        return true;
      });
      
      // Remove duplicates based on metadata (same payment intent, same tracks)
      const seen = new Map();
      user.moneyOwed = user.moneyOwed.filter(owed => {
        if (owed.metadata && owed.metadata.paymentIntentId) {
          const key = `${owed.metadata.paymentIntentId}_${owed.amount}_${owed.source}`;
          if (seen.has(key)) {
            console.log(`[CLEANUP] Removing duplicate entry for ${user.email}: ${owed.reference}`);
            return false;
          }
          seen.set(key, true);
        }
        return true;
      });
      
      const cleanedCount = originalCount - user.moneyOwed.length;
      
      if (cleanedCount > 0) {
        await user.save();
        totalCleaned += cleanedCount;
        totalUsers++;
        console.log(`[CLEANUP] Cleaned ${cleanedCount} entries for ${user.email}`);
      }
    }
    
    console.log(`[CLEANUP] Cleanup completed: ${totalCleaned} entries removed from ${totalUsers} users`);
    
  } catch (error) {
    console.error('[CLEANUP] Error during cleanup:', error);
  }
}

// Main execution
async function main() {
  try {
    // Connect to DB when running standalone
    await connectDB();
    await processPayouts();
    await cleanupStaleMoneyOwed();
    
    console.log('[CRON PAYOUT] Process completed successfully');
  } catch (error) {
    console.error('[CRON PAYOUT] Process failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('[CRON PAYOUT] Database connection closed');
    process.exit(0);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { processPayouts, cleanupStaleMoneyOwed };
