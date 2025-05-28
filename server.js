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
    await processExpiredCommissions({

    body: {},
    user: {role: "admin"} 
    }, {
        status: () => ({ json: (data) => console.log(data) })

    });








}
catch (error) {

    console.error('Error running cron job:', error);

}



})

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
//connect to MongoDBAtlas. This will store the data.
mongoose.connect(process.env.MONGODB_URI)
    
    .then(() => {
        console.log('Connected to MongoDB');
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
app.use('/webhook', webhookRoutes);
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

app.listen(port, () => {


console.log(`Server is running on http://localhost:${port}`); //check the console to see if server is running
});

 //check aws has loaded properly.
export default app;