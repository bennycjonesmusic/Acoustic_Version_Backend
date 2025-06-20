import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import authMiddleware from './middleware/customer_auth.js';
import artistAuthMiddleware from './middleware/artist_auth.js';
import adminRoutes from './routes/admin.js';
import stripeRoutes from './routes/stripe_payment.js';
import webhookRoutes from './routes/webhook.js';
import tracksRoutes from './routes/tracks.js';
import userRoutes from './routes/users.js';
import publicRoutes from './routes/public.js';
import commissionRoutes from './routes/commission.js';
// import guideRoutes from './routes/guide.js'; // Commented out - using new guide routes in tracks.js
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { processExpiredCommissionsStandalone } from './controllers/commissionControl.js';
import User from './models/User.js';
import adminEmails from './utils/admins.js'; // Import adminEmails
import { deleteUnusedAvatars } from './utils/deleteUnusedAvatars.js'; // Import the function to delete unused avatars
import { deleteCron } from './utils/deleteCron.js'; // Import the function to delete soft-deleted tracks
import helmet from 'helmet'; // Import helmet middleware
import compression from 'compression'; // Import compression middleware
import stripeSubscriptionsRouter from './routes/stripe_subscriptions.js'; // Import the new Stripe subscriptions router
import { recalculateAllUserStorage } from './utils/recalculateUserStorage.js'; // Import the storage recalculation utility
import reportRoutes from './routes/report.js'; // Import reportRoutes
import ordersRoutes from './routes/orders.js'; // Import orders routes
import artistsRoutes from './routes/artists.js'; // Import artists routes
import notificationsRoutes from './routes/notifications.js'; // Import notifications routes
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

// Handle uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

cron.schedule('0 * * * *', async () => {
  try {
    console.log("Running cron job to process expired commissions");
    const results = await processExpiredCommissionsStandalone();
    console.log(`Cron job completed. Processed ${results.length} expired commissions.`);
  } catch (error) {
    console.error('Error running expired commissions cron job:', error);
  }
});

//cron job for regular admin adding

cron.schedule('0 * * * *', async () => {

try {

console.log("Running cron job")
const result = await User.updateMany(
    { email: {$in: adminEmails} },
    { $set: { role: 'admin' }}




)
console.log(`Updated ${result.modifiedCount} users to admin role.`);

} catch (error) {
    console.error('Error running cron job:', error);

}

});


// Cron job to delete unused avatars every 24 hours
cron.schedule('0 3 * * *', async () => {
  try {
    console.log('Running daily cron job to delete unused avatars');
    await deleteUnusedAvatars();
  } catch (error) {
    console.error('Error running deleteUnusedAvatars cron job:', error);
  }
});

// Cron job to delete soft-deleted tracks that are no longer purchased by anyone
cron.schedule('0 * * * *', async () => {
  try {
    console.log('Running hourly cron job to clean up soft-deleted tracks');
    await deleteCron();
    console.log('Soft-deleted tracks cleanup cron job completed');
  } catch (error) {
    console.error('Error running deleteCron job:', error);
  }
});

// Cron job to process money owed payouts
// TODO: Eventually migrate this to system-level cron for better production practices
// Reasons to migrate:
// 1. If we scale to multiple servers, this will run multiple times (bad!)
// 2. Web server restarts will interrupt payout processing
// 3. Heavy payout processing could slow down HTTP responses during busy periods
// 4. Harder to monitor/debug when mixed with web server logs
// For now it's fine since we're on a single server, but worth moving out later

// Development: Every 2 minutes for faster testing
// Production: Every hour
const payoutSchedule = process.env.NODE_ENV === 'production' ? '0 * * * *' : '*/2 * * * *';
console.log(`[CRON] Setting up payout cron job with schedule: ${payoutSchedule} (${process.env.NODE_ENV === 'production' ? 'hourly' : 'every 2 minutes'})`);

cron.schedule(payoutSchedule, async () => {
  try {
    console.log(`Running ${process.env.NODE_ENV === 'production' ? 'hourly' : 'development'} cron job to process money owed payouts`);
    const { processPayouts } = await import('./utils/cron_payout_money_owed.js');
    await processPayouts();
    console.log('Money owed payout cron job completed');
  } catch (error) {
    console.error('Error running money owed payout cron job:', error);
  }
});

// Cron job to reconcile Stripe payments (commission and purchased tracks fallback)
const reconcileSchedule = process.env.NODE_ENV === 'production' ? '*/10 * * * *' : '*/2 * * * *';
console.log(`[CRON] Setting up Stripe reconciliation cron job with schedule: ${reconcileSchedule} (${process.env.NODE_ENV === 'production' ? 'every 10 minutes' : 'every 2 minutes'})`);
cron.schedule(reconcileSchedule, async () => {
  try {
    console.log(`Running ${process.env.NODE_ENV === 'production' ? 'every 10 minutes' : 'every 2 minutes'} cron job to reconcile Stripe payments`);
    const { reconcileStripePayments } = await import('./utils/cron_stripe_reconcile.js');
    await reconcileStripePayments();
    console.log('Stripe reconciliation cron job completed');
  } catch (error) {
    console.error('Error running Stripe reconciliation cron job:', error);
  }
});

// Run deleteUnusedAvatars immediately on server start
(async () => {
  try {
    console.log('Running initial deleteUnusedAvatars');
    await deleteUnusedAvatars();
  } catch (error) {
    console.error('Error running initial deleteUnusedAvatars:', error);
  }
})();

// Recalculate user storage at server start
recalculateAllUserStorage().catch(err => console.error('Storage recalculation error:', err));

// Schedule to run once daily at midnight
cron.schedule('0 0 * * *', () => {
  recalculateAllUserStorage().catch(err => console.error('Scheduled storage recalculation error:', err));
});

//connect to MongoDBAtlas. This will store the data.
mongoose.connect(process.env.MONGODB_URI)
    
    .then(async() => {
        console.log('Connected to MongoDB');
          try {
    console.log("Running initial admin update");
    const result = await User.updateMany(
      { email: { $in: adminEmails } },
      { $set: { role: 'admin' } }
    );
    console.log(`Updated ${result.modifiedCount || result.nModified || 0} users to admin role (initial run).`);
  } catch (error) {
    console.error('Error running initial admin update:', error);
  }
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB:', error);
    });
const app = express();

app.use((req, res, next) => {
  console.log('[GLOBAL DEBUG]', req.method, req.url);
  next();
});


//const cors = require('cors');
//app.use(cors({
  //origin: ['http://localhost:3002', 'https://acoustic-version.com'],
  //credentials: true
//}));

//define the middleware. This will be used to parse the incoming requests. It allows frontend to communicate with the backend.
app.use(cors({
  origin: ['http://localhost:3002', 'http://localhost:3003', 'https://acoustic-version.com', 'https://www.acoustic-version.com'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cache-Control'],
  credentials: true // Allow cookies to be sent with requests
}));
console.log('[SERVER DEBUG] Importing and registering /webhook route');
// Register the webhook route BEFORE any body parsers!
app.use('/webhook/stripe', webhookRoutes); // <-- Change to match Stripe CLI forwarding
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet()); // Use helmet middleware to set secure HTTP headers
app.use(compression()); // Enable gzip compression for all responses

// Global rate limiter: 100 requests per 15 minutes per IP (disabled in test mode)
const globalLimiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next() // No-op in test mode
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Too many requests, please try again later.' }
});

app.use(globalLimiter);
app.use('/stripe-subscriptions', stripeSubscriptionsRouter); // Register the new Stripe subscriptions route
app.use('/stripe', stripeRoutes);
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use('/public', publicRoutes);
app.use('/users', userRoutes);
app.use('/artists', artistsRoutes); // Add artists routes
app.use('/orders', ordersRoutes); // Add orders routes
app.use('/notifications', notificationsRoutes); // Add notifications routes
app.use('/commission', commissionRoutes);
// app.use('/', guideRoutes); // Commented out - using new guide routes in tracks.js
app.use('/', tracksRoutes);
app.get('/', (req, res) =>{

    res.send('Testing');


});

app.use("/protectedUser", authMiddleware, (req, res) => {
    res.status(200).json({ message: "Authorized user"})
}); //protected route. Only accessible if the user is logged in, and is not an artist.
app.use("/protectedArtist", artistAuthMiddleware, (req, res) => {
 res.status(200).json({ message: "Authorized artist"});

});

// Health check endpoint for load balancers and uptime monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/report', reportRoutes);

const swaggerDocument = YAML.load('./openapi.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Global error handler - MUST be the last middleware before starting the server
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`[GLOBAL ERROR HANDLER] [${timestamp}] ${req.method} ${req.url}`);
  
  // Log the error details
  if (err && err.stack) {
    console.error('Stack:', err.stack);
  } else {
    console.error('Error object:', err);
  }
  
  // Ensure we always send a JSON response, never binary data
  if (!res.headersSent) {
    res.status(err.status || 500).json({ 
      error: 'Internal server error',
      message: err.message || 'An unexpected error occurred',
      timestamp: timestamp
    });
  }
});

const port = 3000; //set the port. This will be the port that the server will listen on. Lovely job.

const server = app.listen(port, () => {
console.log(`Server is running on http://localhost:${port}`); //check the console to see if server is running
});

//make sure the server closes gracefully when the process is terminated
function gracefulShutdown() {

  console.log('Received shutdown signal, closing server gracefully...');
  server.close(async () => {
    console.log('Server closed gracefully');
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
      process.exit(0);
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
      process.exit(1);
    }
  });

}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);


 //check aws has loaded properly.
export default app;