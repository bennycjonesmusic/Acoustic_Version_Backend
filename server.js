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
import { processExpiredCommissions } from './controllers/commissionControl.js';
import User from './models/User.js';
import adminEmails from './utils/admins.js'; // Import adminEmails
import { deleteCron } from './utils/deleteCron.js';
import { deleteUnusedAvatars } from './utils/deleteUnusedAvatars.js';

// Handle uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
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

// Global rate limiter: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' }
});

app.use(globalLimiter);

//When /auth is hit, use the authRoutes. 
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use('/stripe', stripeRoutes);
app.use('/', tracksRoutes);
app.use('/users', userRoutes);
app.use('/public', publicRoutes);
app.use('/commission', commissionRoutes);
app.get('/', (req, res) =>{
    res.send('Testing');
});

app.use("/protectedUser", authMiddleware, (req, res) => {
    res.status(200).json({ message: "Authorized user"})
}); //protected route. Only accessible if the user is logged in, and is not an artist.
app.use("/protectedArtist", artistAuthMiddleware, (req, res) => {
 res.status(200).json({ message: "Authorized artist"});

});
const port = 3000; //set the port. This will be the port that the server will listen on. Lovely job.

//connect to MongoDBAtlas. This will store the data.
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        // --- DB-dependent startup logic below ---

        // Run admin update immediately on server start
        (async () => {
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
        })();

        // Cron job for regular admin adding
        cron.schedule('0 * * * *', async () => {
          try {
            console.log("Running cron job");
            const result = await User.updateMany(
                { email: {$in: adminEmails} },
                { $set: { role: 'admin' }}
            );
            console.log(`Updated ${result.modifiedCount} users to admin role.`);
          } catch (error) {
            console.error('Error running cron job:', error);
          }
        });

        // Cron job to process expired commissions
        cron.schedule('0 * * * *', async () => {
          try {
              console.log("Running cron job to process expired commissions");
              await processExpiredCommissions({
                body: {},
                user: {role: "admin"} 
              }, {
                  status: () => ({ json: (data) => console.log(data) })
              });
          } catch (error) {
              console.error('Error running cron job:', error);
          }
        });

        // Run deleteCron once on server startup
        (async () => {
          try {
            await deleteCron();
            console.log('Ran deleteCron on server startup.');
          } catch (err) {
            console.error('Error running deleteCron on startup:', err);
          }
        })();

        // Schedule deleteCron to run every day at 4am UK time (Europe/London)
        cron.schedule('0 4 * * *', async () => {
          try {
            await deleteCron();
            console.log('Ran deleteCron as scheduled (4am UK time).');
          } catch (err) {
            console.error('Error running scheduled deleteCron:', err);
          }
        }, {
          timezone: 'Europe/London'
        });

        // Run deleteUnusedAvatars on startup and every 24 hours
        (async () => {
          try {
            await deleteUnusedAvatars();
            setInterval(async () => {
              await deleteUnusedAvatars();
            }, 24 * 60 * 60 * 1000);
          } catch (err) {
            console.error('Error running deleteUnusedAvatars:', err);
          }
        })();

        // Schedule deleteUnusedAvatars to run every 24 hours at 4:05am UK time
        cron.schedule('5 4 * * *', async () => {
          try {
            await deleteUnusedAvatars();
            console.log('Ran deleteUnusedAvatars as scheduled (4:05am UK time).');
          } catch (err) {
            console.error('Error running scheduled deleteUnusedAvatars:', err);
          }
        }, {
          timezone: 'Europe/London'
        });

        // Start the server only after DB is connected and all startup logic is set up
        app.listen(port, () => {
          console.log(`Server is running on http://localhost:${port}`);
        });
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB:', error);
    });

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