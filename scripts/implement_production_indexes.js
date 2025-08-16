#!/usr/bin/env node

/**
 * Production MongoDB Index Implementation Script
 * 
 * ⚠️  NOTICE: As of the latest update, all production indexes are now defined 
 * directly in the Mongoose schemas and will be created automatically when 
 * the application starts. This script is kept for reference and manual 
 * verification purposes only.
 * 
 * The indexes are now embedded in:
 * - models/User.js (authentication, search, payouts)
 * - models/backing_track.js (search, filtering, text search)
 * - models/CommissionRequest.js (status queries, deadlines) 
 * - models/Notifications.js (user notifications)
 * - models/contact_form.js (admin queries)
 * - models/website.js (error tracking)
 * 
 * This script implements all the recommended indexes for production performance
 * based on the analysis in MONGODB_INDEXES_ANALYSIS.md
 * 
 * Usage: node implement_production_indexes.js (for manual verification only)
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

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

async function createIndexes() {
  const db = mongoose.connection.db;
  
  console.log('\n🚀 Starting MongoDB index creation for production...\n');

  try {
    // PRIORITY 1: Critical performance indexes
    console.log('📊 Creating PRIORITY 1 indexes (Critical Performance)...\n');

    // Users collection - authentication and search
    console.log('Creating User indexes...');
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ stripeAccountId: 1 });
    await db.collection('users').createIndex({ 
      username: 1, 
      email: 1, 
      'profile.artistName': 1 
    }, { name: 'user_search_compound' });
    await db.collection('users').createIndex({ 
      stripeAccountId: 1, 
      stripePayoutsEnabled: 1 
    }, { name: 'stripe_payout_compound' });
    console.log('✅ User indexes created');

    // BackingTracks collection - main search and filtering
    console.log('Creating BackingTrack indexes...');
    await db.collection('backingtracks').createIndex({ 
      'tags.key': 1, 
      'tags.tempo': 1, 
      'tags.genre': 1 
    }, { name: 'search_filters_compound' });
    await db.collection('backingtracks').createIndex({ 
      artist: 1, 
      approved: 1, 
      createdAt: -1 
    }, { name: 'artist_tracks_compound' });
    await db.collection('backingtracks').createIndex({ 
      approved: 1, 
      createdAt: -1 
    }, { name: 'approved_tracks_recent' });
    await db.collection('backingtracks').createIndex({ artist: 1 });
    console.log('✅ BackingTrack indexes created');

    // CommissionRequests collection - status and user queries
    console.log('Creating CommissionRequest indexes...');
    await db.collection('commissionrequests').createIndex({ 
      artist: 1, 
      status: 1, 
      createdAt: -1 
    }, { name: 'artist_commissions_compound' });
    await db.collection('commissionrequests').createIndex({ 
      customer: 1, 
      status: 1, 
      createdAt: -1 
    }, { name: 'customer_commissions_compound' });
    await db.collection('commissionrequests').createIndex({ 
      status: 1, 
      createdAt: -1 
    }, { name: 'status_commissions_compound' });
    console.log('✅ CommissionRequest indexes created');

    // PRIORITY 2: Performance optimization indexes
    console.log('\n📈 Creating PRIORITY 2 indexes (Performance Optimization)...\n');

    // Website collection - admin dashboard
    console.log('Creating Website collection indexes...');
    await db.collection('websites').createIndex({ 'errors.timestamp': -1 });
    await db.collection('websites').createIndex({ 'errors.errorType': 1, 'errors.timestamp': -1 });
    console.log('✅ Website collection indexes created');

    // Notifications collection - user notifications
    console.log('Creating Notifications indexes...');
    await db.collection('notifications').createIndex({ 
      user: 1, 
      read: 1, 
      createdAt: -1 
    }, { name: 'user_notifications_compound' });
    console.log('✅ Notifications indexes created');

    // ContactForm collection - admin queries
    console.log('Creating ContactForm indexes...');
    await db.collection('contactforms').createIndex({ createdAt: -1 });
    await db.collection('contactforms').createIndex({ responded: 1, createdAt: -1 });
    console.log('✅ ContactForm indexes created');

    // PRIORITY 3: Specialized indexes
    console.log('\n🎯 Creating PRIORITY 3 indexes (Specialized)...\n');

    // Users - money owed processing
    console.log('Creating money owed processing indexes...');
    await db.collection('users').createIndex({ 
      'moneyOwed.0': 1, 
      stripeAccountId: 1, 
      stripePayoutsEnabled: 1 
    }, { 
      name: 'money_owed_processing',
      partialFilterExpression: { 
        'moneyOwed.0': { $exists: true },
        stripeAccountId: { $exists: true, $ne: null },
        stripePayoutsEnabled: true
      }
    });
    console.log('✅ Money owed processing indexes created');

    // BackingTracks - advanced search features
    console.log('Creating advanced search indexes...');
    await db.collection('backingtracks').createIndex({ 
      approved: 1, 
      'tags.key': 1, 
      'tags.tempo': 1, 
      'tags.genre': 1, 
      'tags.timeSignature': 1 
    }, { name: 'advanced_search_compound' });
    
    // Text search index for track names and descriptions
    await db.collection('backingtracks').createIndex({ 
      name: 'text', 
      description: 'text' 
    }, { name: 'track_text_search' });
    console.log('✅ Advanced search indexes created');

    // CommissionRequests - cron job optimization
    console.log('Creating commission cron job indexes...');
    await db.collection('commissionrequests').createIndex({ 
      status: 1, 
      deadline: 1 
    }, { name: 'commission_deadline_check' });
    console.log('✅ Commission cron job indexes created');

    console.log('\n🎉 All production indexes created successfully!\n');
    
    // Display created indexes summary
    console.log('📋 Index Summary:');
    console.log('├── Users: 4 indexes (authentication, search, payouts)');
    console.log('├── BackingTracks: 6 indexes (search, filtering, text search)');
    console.log('├── CommissionRequests: 4 indexes (status queries, deadlines)');
    console.log('├── Website: 2 indexes (error tracking)');
    console.log('├── Notifications: 1 index (user notifications)');
    console.log('└── ContactForms: 2 indexes (admin queries)');
    console.log('\n✅ Production database is now optimized for performance!');

  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    throw error;
  }
}

async function verifyIndexes() {
  const db = mongoose.connection.db;
  
  console.log('\n🔍 Verifying created indexes...\n');
  
  const collections = ['users', 'backingtracks', 'commissionrequests', 'websites', 'notifications', 'contactforms'];
  
  for (const collectionName of collections) {
    try {
      const indexes = await db.collection(collectionName).indexes();
      console.log(`📊 ${collectionName}: ${indexes.length} indexes`);
      
      // Show index names for verification
      indexes.forEach(index => {
        if (index.name !== '_id_') {
          console.log(`   └── ${index.name || 'unnamed'}: ${JSON.stringify(index.key)}`);
        }
      });
    } catch (error) {
      console.log(`⚠️  Collection ${collectionName} not found or error: ${error.message}`);
    }
  }
}

async function main() {
  try {
    await connectDB();
    await createIndexes();
    await verifyIndexes();
    
    console.log('\n🎯 Next Steps:');
    console.log('1. Monitor query performance with MongoDB Compass or Atlas');
    console.log('2. Review slow query logs after deployment');
    console.log('3. Consider adding more indexes based on actual usage patterns');
    console.log('4. Update application code to leverage new indexes');
    
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔐 Database connection closed');
    process.exit(0);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createIndexes, verifyIndexes };
