import NodeCache from 'node-cache';

// Enhanced cache instance for production use
const cache = new NodeCache({ 
  stdTTL: 60 * 60,           // 1 hour default TTL
  maxKeys: 1000,             // Limit cache size to prevent memory issues
  checkperiod: 60,           // Check for expired keys every 1 minute (more aggressive)
  useClones: false,          // Better performance, don't clone objects
  deleteOnExpire: true,      // Automatically delete expired keys
  forceString: false         // Allow any data type
});

// More aggressive cleanup when approaching limits
cache.on('set', (key, value) => {
  const stats = cache.getStats();
  
  // Warning at 80% capacity
  if (stats.keys > 800) {
    console.warn(`⚠️  Cache approaching capacity: ${stats.keys}/1000 keys`);
  }
  
  // Force cleanup at 90% capacity
  if (stats.keys > 900) {
    console.log(`🧹 Forcing cache cleanup at ${stats.keys} keys`);
    
    // Get all keys and their TTLs
    const allKeys = cache.keys();
    const now = Math.floor(Date.now() / 1000);
    
    // Remove keys that are close to expiring (within 5 minutes)
    allKeys.forEach(k => {
      const ttl = cache.getTtl(k);
      if (ttl && ttl < (now + 300) * 1000) { // TTL is in milliseconds
        cache.del(k);
      }
    });
    
    console.log(`🧹 Cleanup complete. Keys now: ${cache.getStats().keys}`);
  }
  
  // Emergency cleanup at 95% - remove oldest keys
  if (stats.keys > 950) {
    console.warn(`🚨 Emergency cleanup at ${stats.keys} keys`);
    const allKeys = cache.keys();
    const keysToRemove = Math.floor(allKeys.length * 0.1); // Remove 10%
    
    for (let i = 0; i < keysToRemove; i++) {
      cache.del(allKeys[i]);
    }
    
    console.log(`🚨 Emergency cleanup complete. Removed ${keysToRemove} keys. Keys now: ${cache.getStats().keys}`);
  }
});

// Manual cleanup function for periodic use
cache.forceCleanup = () => {
  const beforeCount = cache.getStats().keys;
  
  // Force expire check on all keys
  const allKeys = cache.keys();
  allKeys.forEach(key => {
    cache.get(key); // This will remove the key if it's expired
  });
  
  const afterCount = cache.getStats().keys;
  const cleaned = beforeCount - afterCount;
  
  if (cleaned > 0) {
    console.log(`🧹 Manual cleanup removed ${cleaned} expired keys`);
  }
  
  return cleaned;
};

// Periodic forced cleanup every 10 minutes
setInterval(() => {
  cache.forceCleanup();
}, 10 * 60 * 1000);

cache.on('del', (key, value) => {
  console.log(`🗑️  Cache key deleted: ${key}`);
});

// Add utility methods for monitoring
cache.getMemoryUsage = () => {
  const stats = cache.getStats();
  return {
    keys: stats.keys,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits / (stats.hits + stats.misses) || 0,
    maxKeys: 1000
  };
};

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('🔄 Clearing cache on shutdown...');
  cache.flushAll();
});

export default cache;
