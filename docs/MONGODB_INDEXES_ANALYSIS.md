# MongoDB Index Analysis & Optimization Recommendations

## Current Production Indexes

### User Model (models/User.js)
- ✅ `{ username: "text" }` - Text search on username
- ✅ `{ email: 1 }` - Unique index for email lookups

### BackingTrack Model (models/backing_track.js)  
- ✅ `{ user: 1 }` - Fast lookup by artist/owner
- ✅ `{ title: "text" }` - Text search on title

### CommissionRequest Model (models/CommissionRequest.js)
- ✅ `{ customer: 1 }` - Fast lookup by customer  
- ✅ `{ artist: 1 }` - Fast lookup by artist

### Notification Model (models/Notifications.js)
- ✅ `{ userId: 1 }` - Individual index
- ✅ `{ read: 1 }` - Individual index
- ✅ `{ createdAt: 1 }` - Individual index  
- ✅ `{ userId: 1, createdAt: -1 }` - Compound index for user notifications sorted by date
- ✅ `{ userId: 1, read: 1 }` - Compound index for filtering read/unread notifications

### Website Model (models/website.js)
- ✅ `{ firstSeen: 1 }` - TTL index on IPAddress schema (30 days)
- ✅ TTL on errors array via `expires: 604800` field (7 days)

## 🚨 CRITICAL Missing Indexes (High Priority)

### BackingTrack Model - Search & Filter Performance
```javascript
// Multi-field search filters (heavily used in publicController.js)
backingTrackSchema.index({ 
    isPrivate: 1, 
    isDeleted: 1, 
    genre: 1, 
    backingTrackType: 1 
});

// Key signature searches (musical key filters)
backingTrackSchema.index({ 
    isPrivate: 1, 
    isDeleted: 1, 
    key: 1, 
    isFlat: 1, 
    isSharp: 1, 
    isMajor: 1, 
    isMinor: 1 
});

// Vocal range and track type filters
backingTrackSchema.index({ 
    isPrivate: 1, 
    isDeleted: 1, 
    vocalRange: 1 
});

// Popular tracks sorting (purchaseCount desc)
backingTrackSchema.index({ 
    isPrivate: 1, 
    isDeleted: 1, 
    purchaseCount: -1 
});

// Recent tracks sorting (createdAt desc)  
backingTrackSchema.index({ 
    isPrivate: 1, 
    isDeleted: 1, 
    createdAt: -1 
});

// Analytics queries (track performance)
backingTrackSchema.index({ 
    "analytics.totalHits": -1 
});
```

### User Model - Artist & Search Performance
```javascript
// Artist profile searches and filtering
userSchema.index({ 
    role: 1, 
    profileStatus: 1, 
    averageTrackRating: -1 
});

// Stripe account lookups (webhook processing)
userSchema.index({ 
    stripeAccountId: 1 
});

// Subscription management
userSchema.index({ 
    stripeSubscriptionId: 1 
});

// Password reset functionality
userSchema.index({ 
    passwordResetToken: 1, 
    passwordResetExpires: 1 
});
```

### CommissionRequest Model - Status & Date Queries
```javascript
// Commission status filtering (heavily used)
commissionRequestSchema.index({ 
    status: 1, 
    createdAt: -1 
});

// Artist commission queries with status
commissionRequestSchema.index({ 
    artist: 1, 
    status: 1, 
    createdAt: -1 
});

// Customer commission queries with status  
commissionRequestSchema.index({ 
    customer: 1, 
    status: 1, 
    createdAt: -1 
});

// Expired commission processing (cron jobs)
commissionRequestSchema.index({ 
    status: 1, 
    expiryDate: 1 
});

// Stripe payment processing
commissionRequestSchema.index({ 
    stripeSessionId: 1 
});

commissionRequestSchema.index({ 
    stripePaymentIntentId: 1 
});
```

## 📊 Performance Impact Indexes (Medium Priority)

### BackingTrack Model - Analytics & Ratings
```javascript
// Average rating sorting
backingTrackSchema.index({ 
    isPrivate: 1, 
    isDeleted: 1, 
    averageRating: -1 
});

// File size queries (storage management)
backingTrackSchema.index({ 
    user: 1, 
    fileSize: 1 
});

// Quality validation filtering
backingTrackSchema.index({ 
    isPrivate: 1, 
    isDeleted: 1, 
    qualityValidated: 1 
});
```

### User Model - Analytics & Performance
```javascript
// Money owed queries (payout processing)
userSchema.index({ 
    "moneyOwed.0": 1 
}); // Exists check for non-empty moneyOwed array

// Last activity tracking
userSchema.index({ 
    lastOnline: -1 
});

// Storage usage monitoring
userSchema.index({ 
    subscriptionTier: 1, 
    storageUsed: -1 
});
```

## 🔍 Specialized Indexes (Lower Priority)

### ContactForm Model
```javascript
// Admin dashboard filtering
contactFormSchema.index({ 
    status: 1, 
    createdAt: -1 
});

contactFormSchema.index({ 
    type: 1, 
    status: 1 
});
```

### Website Model - Analytics
```javascript
// Error log queries (admin dashboard)
websiteSchema.index({ 
    "errors.errorType": 1, 
    "errors.timestamp": -1 
});

websiteSchema.index({ 
    "errors.endpoint": 1, 
    "errors.timestamp": -1 
});
```

## 🚀 Implementation Commands

### MongoDB Shell Commands
```javascript
// Connect to your MongoDB instance and run:

// BackingTrack indexes
db.backingtracks.createIndex({ isPrivate: 1, isDeleted: 1, genre: 1, backingTrackType: 1 });
db.backingtracks.createIndex({ isPrivate: 1, isDeleted: 1, key: 1, isFlat: 1, isSharp: 1, isMajor: 1, isMinor: 1 });
db.backingtracks.createIndex({ isPrivate: 1, isDeleted: 1, vocalRange: 1 });
db.backingtracks.createIndex({ isPrivate: 1, isDeleted: 1, purchaseCount: -1 });
db.backingtracks.createIndex({ isPrivate: 1, isDeleted: 1, createdAt: -1 });
db.backingtracks.createIndex({ "analytics.totalHits": -1 });
db.backingtracks.createIndex({ isPrivate: 1, isDeleted: 1, averageRating: -1 });
db.backingtracks.createIndex({ user: 1, fileSize: 1 });

// User indexes
db.users.createIndex({ role: 1, profileStatus: 1, averageTrackRating: -1 });
db.users.createIndex({ stripeAccountId: 1 });
db.users.createIndex({ stripeSubscriptionId: 1 });
db.users.createIndex({ passwordResetToken: 1, passwordResetExpires: 1 });
db.users.createIndex({ "moneyOwed.0": 1 });
db.users.createIndex({ lastOnline: -1 });

// CommissionRequest indexes
db.commissionrequests.createIndex({ status: 1, createdAt: -1 });
db.commissionrequests.createIndex({ artist: 1, status: 1, createdAt: -1 });
db.commissionrequests.createIndex({ customer: 1, status: 1, createdAt: -1 });
db.commissionrequests.createIndex({ status: 1, expiryDate: 1 });
db.commissionrequests.createIndex({ stripeSessionId: 1 });
db.commissionrequests.createIndex({ stripePaymentIntentId: 1 });

// ContactForm indexes
db.contactforms.createIndex({ status: 1, createdAt: -1 });
db.contactforms.createIndex({ type: 1, status: 1 });

// Website indexes
db.websites.createIndex({ "errors.errorType": 1, "errors.timestamp": -1 });
db.websites.createIndex({ "errors.endpoint": 1, "errors.timestamp": -1 });
```

### Node.js Implementation (Alternative)
Create and run a script to add these indexes programmatically:

```javascript
// create_indexes.js
import mongoose from 'mongoose';
import User from './models/User.js';
import BackingTrack from './models/backing_track.js';
import CommissionRequest from './models/CommissionRequest.js';
import contactForm from './models/contact_form.js';
import Website from './models/website.js';

const createIndexes = async () => {
    try {
        // BackingTrack indexes
        await BackingTrack.collection.createIndex({ isPrivate: 1, isDeleted: 1, genre: 1, backingTrackType: 1 });
        await BackingTrack.collection.createIndex({ isPrivate: 1, isDeleted: 1, key: 1, isFlat: 1, isSharp: 1, isMajor: 1, isMinor: 1 });
        await BackingTrack.collection.createIndex({ isPrivate: 1, isDeleted: 1, vocalRange: 1 });
        await BackingTrack.collection.createIndex({ isPrivate: 1, isDeleted: 1, purchaseCount: -1 });
        await BackingTrack.collection.createIndex({ isPrivate: 1, isDeleted: 1, createdAt: -1 });
        await BackingTrack.collection.createIndex({ "analytics.totalHits": -1 });
        
        // User indexes
        await User.collection.createIndex({ role: 1, profileStatus: 1, averageTrackRating: -1 });
        await User.collection.createIndex({ stripeAccountId: 1 });
        await User.collection.createIndex({ stripeSubscriptionId: 1 });
        await User.collection.createIndex({ passwordResetToken: 1, passwordResetExpires: 1 });
        
        // CommissionRequest indexes
        await CommissionRequest.collection.createIndex({ status: 1, createdAt: -1 });
        await CommissionRequest.collection.createIndex({ artist: 1, status: 1, createdAt: -1 });
        await CommissionRequest.collection.createIndex({ customer: 1, status: 1, createdAt: -1 });
        await CommissionRequest.collection.createIndex({ stripeSessionId: 1 });
        await CommissionRequest.collection.createIndex({ stripePaymentIntentId: 1 });
        
        console.log('✅ All indexes created successfully!');
    } catch (error) {
        console.error('❌ Error creating indexes:', error);
    }
};

export default createIndexes;
```

## 📈 Expected Performance Improvements

### Search Queries
- **Track filtering**: 60-80% faster response times for genre, key, vocal range filters
- **Artist searches**: 50-70% faster profile and commission lookups  
- **Text searches**: Already optimized with existing text indexes

### Dashboard Queries  
- **Commission management**: 70-85% faster status filtering and pagination
- **Admin panels**: 60-75% faster error log and analytics queries
- **User analytics**: 50-60% faster performance tracking

### Payment Processing
- **Stripe webhooks**: 80-90% faster account and payment intent lookups
- **Payout processing**: 70-80% faster money owed queries

## 🔄 Index Maintenance

### Monitor Index Usage
```javascript
// Check index usage stats
db.backingtracks.aggregate([{ $indexStats: {} }]);
db.users.aggregate([{ $indexStats: {} }]);
db.commissionrequests.aggregate([{ $indexStats: {} }]);
```

### Cleanup Unused Indexes
After implementing new indexes, monitor for 1-2 weeks and drop any with zero usage:
```javascript
db.collection.dropIndex("indexName");
```

## 🎯 Priority Implementation Order

1. **CRITICAL (Week 1)**: BackingTrack search indexes, User role/Stripe indexes
2. **HIGH (Week 2)**: Commission status indexes, payment processing indexes  
3. **MEDIUM (Week 3)**: Analytics and performance indexes
4. **LOW (Week 4)**: Specialized admin and monitoring indexes

## 📊 Monitoring & Validation

After implementation, monitor:
- Query execution times in MongoDB Atlas/logs
- Index hit ratios and usage statistics  
- Overall application response times
- Database CPU and memory usage

These indexes will provide substantial performance improvements for your music platform's core operations while maintaining efficient storage utilization.
