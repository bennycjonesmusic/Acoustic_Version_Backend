import NodeCache from 'node-cache';

// Shared cache instance used across the application
const cache = new NodeCache({ stdTTL: 60 * 60 }); // Cache for 1 hour

export default cache;
