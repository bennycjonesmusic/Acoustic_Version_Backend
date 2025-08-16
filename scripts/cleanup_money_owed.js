#!/usr/bin/env node

/**
 * Manual Money Owed Cleanup Script
 * 
 * This script manually cleans up stale, invalid, or duplicate entries
 * in the moneyOwed arrays across all users.
 * 
 * Usage:
 *   node cleanup_money_owed.js
 * 
 * What it cleans:
 * - Entries older than 30 days (logs but keeps for manual review)
 * - Invalid amounts (≤ 0 or > £10,000)
 * - Invalid sources (not cart_purchase, commission, or manual)
 * - Duplicate entries based on payment intent and metadata
 */

import mongoose from 'mongoose';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function manualCleanup() {
  try {
    console.log('🧹 Starting manual cleanup of money owed entries...\n');
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const users = await User.find({ 
      'moneyOwed.0': { $exists: true } 
    }).select('displayName email moneyOwed');
    
    console.log(`📊 Found ${users.length} users with money owed entries\n`);
    
    let totalCleaned = 0;
    let totalUsers = 0;
    let totalValue = 0;
    
    for (const user of users) {
      const originalCount = user.moneyOwed.length;
      const originalValue = user.moneyOwed.reduce((sum, owed) => sum + owed.amount, 0);
      
      console.log(`\n👤 ${user.displayName || user.email}:`);
      console.log(`   Original: ${originalCount} entries, £${originalValue.toFixed(2)} total`);
      
      const removedEntries = [];
      
      // Filter out invalid entries
      user.moneyOwed = user.moneyOwed.filter(owed => {
        // Check for invalid amounts
        if (!owed.amount || owed.amount <= 0 || owed.amount > 10000) {
          removedEntries.push(`Invalid amount: £${owed.amount}`);
          return false;
        }
        
        // Check for invalid sources
        if (!owed.source || !['cart_purchase', 'commission', 'manual'].includes(owed.source)) {
          removedEntries.push(`Invalid source: ${owed.source}`);
          return false;
        }
        
        // Check for very old entries (older than 30 days)
        if (owed.createdAt && owed.createdAt <= thirtyDaysAgo) {
          console.log(`   ⚠️  Old entry (${owed.createdAt.toDateString()}): £${owed.amount} - keeping for review`);
        }
        
        return true;
      });
      
      // Remove duplicates based on metadata
      const seen = new Map();
      user.moneyOwed = user.moneyOwed.filter(owed => {
        if (owed.metadata && owed.metadata.paymentIntentId) {
          const key = `${owed.metadata.paymentIntentId}_${owed.amount}_${owed.source}`;
          if (seen.has(key)) {
            removedEntries.push(`Duplicate: ${owed.reference}`);
            return false;
          }
          seen.set(key, true);
        }
        return true;
      });
      
      const newCount = user.moneyOwed.length;
      const newValue = user.moneyOwed.reduce((sum, owed) => sum + owed.amount, 0);
      const cleanedCount = originalCount - newCount;
      const cleanedValue = originalValue - newValue;
      
      if (cleanedCount > 0) {
        console.log(`   🧹 Cleaned: ${cleanedCount} entries, £${cleanedValue.toFixed(2)} removed`);
        console.log(`   ✅ Result: ${newCount} entries, £${newValue.toFixed(2)} remaining`);
        
        if (removedEntries.length > 0) {
          console.log(`   📝 Removed entries:`);
          removedEntries.forEach(entry => console.log(`      - ${entry}`));
        }
        
        await user.save();
        totalCleaned += cleanedCount;
        totalValue += cleanedValue;
        totalUsers++;
      } else {
        console.log(`   ✅ No cleanup needed`);
      }
    }
    
    console.log('\n📈 Cleanup Summary:');
    console.log(`   • Users processed: ${users.length}`);
    console.log(`   • Users cleaned: ${totalUsers}`);
    console.log(`   • Entries removed: ${totalCleaned}`);
    console.log(`   • Value removed: £${totalValue.toFixed(2)}`);
    
    if (totalCleaned === 0) {
      console.log('\n🎉 No cleanup needed - all money owed entries are valid!');
    } else {
      console.log(`\n✨ Cleanup completed successfully!`);
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

async function main() {
  try {
    await connectDB();
    await manualCleanup();
  } catch (error) {
    console.error('❌ Process failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the cleanup
main();
