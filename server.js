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
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { processExpiredCommissionsStandalone } from './controllers/commissionControl.js';
import User from './models/User.js';
import adminEmails from './utils/admins.js'; // Import adminEmails
import { deleteUnusedAvatars } from './utils/deleteUnusedAvatars.js'; // Import the function to delete unused avatars
import helmet from 'helmet'; // Import helmet middleware
import compression from 'compression'; // Import compression middleware
import stripeSubscriptionsRouter from './routes/stripe_subscriptions.js'; // Import the new Stripe subscriptions router
import { recalculateAllUserStorage } from './utils/recalculateUserStorage.js'; // Import the storage recalculation utility
import reportRoutes from './routes/report.js'; // Import reportRoutes
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

// Schedule to run every 6 hours
cron.schedule('0 */6 * * *', () => {
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

//define the middleware. This will be used to parse the incoming requests. It allows frontend to communicate with the backend.
app.use(cors());
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
app.use('/users', userRoutes);
app.use('/public', publicRoutes);
app.use('/commission', commissionRoutes);
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

const port = 3000; //set the port. This will be the port that the server will listen on. Lovely job.

const server = app.listen(port, () => {


console.log(`Server is running on http://localhost:${port}`); //check the console to see if server is running
});

//make sure the server closes gracefully when the process is terminated
function gracefulShutdown() {

  console.log('Received shutdown signal, closing server gracefully...');
  server.close(() => {
    console.log('Server closed gracefully');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  })

}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);


 //check aws has loaded properly.
export default app;

app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`[GLOBAL ERROR HANDLER] [${timestamp}]`);
  if (err && err.stack) {
    console.error('Stack:', err.stack);
  } else {
    console.error('Error object:', err);
  }
  res.status(500).json({ message: 'Internal server error (global handler)' });
});