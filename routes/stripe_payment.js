import express from 'express';
import stripe from 'stripe';
import authMiddleware from '../middleware/customer_auth.js';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import { logError } from '../utils/errorLogger.js';
import http from 'http';


const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

console.log('[stripe_payment.js] Router loaded');

// Helper: Validate MongoDB ObjectId
function isValidObjectId(id) {
    return typeof id === 'string' && id.match(/^[a-f\d]{24}$/i);
}

// Helper function to check webhook health
async function checkStripeWebhookHealth() {
  const webhookHealthUrl = 'http://localhost:3000/webhook/stripe/health';
  return await new Promise((resolve) => {
    http.get(webhookHealthUrl, (resp) => {
      resolve(resp.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

//create account link for Stripe onboarding.
router.post('/create-account-link', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        console.log('[Stripe Onboarding] User before:', user);        if (!user.stripeAccountId) {
            const account = await stripeClient.accounts.create({
                type: 'standard',
                country: 'GB',
                email: user.email
                // Do NOT request capabilities for standard accounts
            });
            user.stripeAccountId = account.id;
            user.stripeAccountStatus = 'pending';
            user.stripePayoutsEnabled = false;
            user.stripeOnboardingComplete = false;
            await user.save();
            console.log('[Stripe Onboarding] Created new Stripe account:', account.id);
        } else {
            // Double-check the field is saved if it exists
            if (!user.stripeAccountId) {
                console.log('[Stripe Onboarding] Stripe account exists but not saved, saving now.');
                await user.save();
            } else {
                console.log('[Stripe Onboarding] User already has Stripe account:', user.stripeAccountId);
            }
        }
        // Fetch user again to confirm
        const updatedUser = await User.findById(req.userId);
        console.log('[Stripe Onboarding] User after:', updatedUser);        const accountLink = await stripeClient.accountLinks.create({
            account: user.stripeAccountId,            refresh_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/reauth`,
            return_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/artist-dashboard`,
            type: 'account_onboarding',
        });
        res.status(200).json({ url: accountLink.url });
    } catch (error) {
        console.error('Error creating account link:', error);
        
        // Log Stripe account creation error
        await logError({
            message: `Stripe account link creation failed: ${error.message}`,
            stack: error.stack,
            errorType: 'stripe_payment'
        }, req, 500);
        
        res.status(500).json({ error: 'Failed to create account link' });
    }
}); 

router.post('/create-cart-checkout-session', authMiddleware, async (req, res) => {
    console.log('[CART CHECKOUT] Starting cart checkout session creation for user:', req.userId);
    
    try {
        const user = await User.findById(req.userId).populate('cart.track');
        console.log('[CART CHECKOUT] User found:', !!user, 'Cart length:', user?.cart?.length || 0);
        
        if (!user || !user.cart || user.cart.length === 0){
            console.log('[CART CHECKOUT] Cart is empty');
            return res.status(400).json({error: 'Cart is empty'})
        }

        // Validate tracks and collect artist payouts
        const validTracks = [];
        const artistPayouts = {};
        
        for (const cartItem of user.cart) {
            const track = cartItem.track;
            
            if (!track) continue;
              // Check if user already owns this track
            const trackIdString = (track._id || track.id).toString();
            const alreadyPurchased = user.purchasedTracks.some(pt => 
                (pt.track?.toString?.() || pt.track) === trackIdString
            );
            if (alreadyPurchased) continue;

            // Skip user's own tracks
            const trackUserId = (track.user._id || track.user.id || track.user).toString();
            if (req.userId === trackUserId) continue;

            validTracks.push(track);
            
            // Track artist payouts
            const artistId = trackUserId;
            if (!artistPayouts[artistId]) {
                artistPayouts[artistId] = { tracks: [], totalEarnings: 0 };
            }
            artistPayouts[artistId].tracks.push(trackIdString);
            artistPayouts[artistId].totalEarnings += Number(track.price);
        }        if (validTracks.length === 0) {
            console.log('[CART CHECKOUT] No valid tracks found after filtering');
            return res.status(400).json({ error: 'No valid tracks in cart to purchase' });
        }

        console.log('[CART CHECKOUT] Valid tracks found:', validTracks.length);
        console.log('[CART CHECKOUT] Artist payouts:', artistPayouts);

        // Build line items for all tracks
        const line_items = [];
        let totalPlatformFee = 0;

        for (const track of validTracks) {
            const customerPrice = Math.round(Number(track.customerPrice) * 100);
            const artistPrice = Math.round(Number(track.price) * 100);
            const platformFee = customerPrice - artistPrice;
            totalPlatformFee += platformFee;

            line_items.push({
                price_data: {
                    currency: 'gbp',
                    product_data: {
                        name: track.title,
                        description: track.description
                    },
                    unit_amount: customerPrice,
                },
                quantity: 1,
            });
        }

        console.log('[CART CHECKOUT] Line items created:', line_items.length);
        console.log('[CART CHECKOUT] Total platform fee:', totalPlatformFee);
        console.log('[CART CHECKOUT] Environment check - CLIENT_URL:', process.env.CLIENT_URL);        const healthCheck = await checkStripeWebhookHealth();
        if (!healthCheck) {
            // Log a warning for admin, but do NOT block the user
            console.warn('[ADMIN WARNING] Stripe webhook health check failed. Webhook may be down.');
            // Optionally: send an email or notification to admin here
        }

        const session = await stripeClient.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: line_items,
            mode: 'payment',
            success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/tracks`,
            metadata: {
                userId: req.userId.toString(),
                purchaseType: 'cart',
                trackIds: validTracks.map(t => (t._id || t.id).toString()).join(','),
                artistPayouts: JSON.stringify(artistPayouts),
                totalPlatformFee: totalPlatformFee.toString()
            }        });

        console.log('[CART CHECKOUT] Stripe session created successfully:', session.id);
        
        if (!session) {
            console.log('[CART CHECKOUT] Session creation returned null/undefined');
            return res.status(500).json({ error: 'Failed to create checkout session' });
        }
        
        console.log('[CART CHECKOUT] Returning session URL:', session.url);
        return res.status(200).json({ url: session.url });
    } catch (error) {
        console.error('[CART CHECKOUT] Error creating cart checkout session:', error);
        console.error('[CART CHECKOUT] Error details:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            type: error.type
        });
        
        // Log cart checkout error
        await logError({
            message: `Cart checkout session creation failed: ${error.message}`,
            stack: error.stack,
            errorType: 'stripe_payment'
        }, req, 500);
        
        return res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

//create checkout session for backing track purchase
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
    console.log('[stripe_payment] /create-checkout-session called, userId:', req.userId, 'body:', req.body);
    try {
        const { trackId } = req.body;
        if (!isValidObjectId(trackId)) {
            console.log('[stripe_payment] Invalid trackId:', trackId);
            return res.status(400).json({ error: 'Invalid track ID' });
        }
        const track = await BackingTrack.findById(trackId);
        if (!track) {
            console.log('[stripe_payment] Track not found for trackId:', trackId);
            return res.status(404).json({ error: 'Track not found' });
        }
        // If track is free, skip Stripe and grant access
        if (Number(track.price) === 0) {
            const user = await User.findById(req.userId);
            if (!user) {
                console.log('[stripe_payment] User not found for free track, userId:', req.userId);
                return res.status(404).json({ error: 'User not found' });
            }
            if (!user.purchasedTracks.some(pt => (pt.track?.toString?.() || pt.track) === track._id.toString())) {
                user.purchasedTracks.push({
                    track: track._id,
                    paymentIntentId: 'free',
                    purchasedAt: new Date(),
                    price: track.price,
                    refunded: false
                });
                await user.save();
            }
            return res.status(200).json({ message: 'Track granted for free', free: true });
        }        const artist = await User.findById(track.user);
        if (!artist || !artist.stripeAccountId) {
            console.log('[stripe_payment] Artist not found or missing Stripe account. artist:', artist, 'track.user:', track.user);
            return res.status(404).json({ error: 'Artist either not found or does not have a stripe account' });
        }
        
        // Check if artist's Stripe account is ready for payouts
        if (!artist.stripePayoutsEnabled) {
            console.log('[stripe_payment] Artist Stripe account payouts not enabled:', artist.stripeAccountId);
            return res.status(400).json({ error: 'Artist Stripe account is not enabled for payouts. Track cannot be purchased at this time.' });
        }
        
        if (artist.stripeAccountStatus !== 'active') {
            console.log('[stripe_payment] Artist Stripe account status not active:', artist.stripeAccountStatus);
            return res.status(400).json({ error: `Artist Stripe account status is ${artist.stripeAccountStatus}. Track cannot be purchased at this time.` });
        }
        
        // Only allow payout if artist is 'artist' or 'admin'
        if (artist.role !== 'artist' && artist.role !== 'admin') {
            return res.status(403).json({ error: 'Payouts are only allowed to users with role artist or admin.' });
        }
        if (!Number.isFinite(track.price) || track.price <= 0) {
            return res.status(400).json({ error: 'Invalid track price' });
        }
        // Use customerPrice for the Stripe line item (customer pays this)
        const customerPrice = Math.round(Number(track.customerPrice) * 100); // in pence
        const artistPrice = Math.round(Number(track.price) * 100); // in pence
        const platformFee = customerPrice - artistPrice;
        if (req.userId === track.user.toString()) {
            return res.status(400).json({ error: 'You cannot purchase your own track.' });
        }
        const healthCheck = await checkStripeWebhookHealth();
        if (!healthCheck) {
            // Log a warning for admin, but do NOT block the user
            console.warn('[ADMIN WARNING] Stripe webhook health check failed. Webhook may be down.');
            // Optionally: send an email or notification to admin here
        }
        const session = await stripeClient.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: track.title,
                            description: track.description
                        },
                        unit_amount: customerPrice, // customer pays this
                    },
                    quantity: 1,
                },
            ],            mode: 'payment',
            success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/tracks`,
            payment_intent_data: {
                application_fee_amount: platformFee, // platform receives this
                transfer_data: {
                    destination: artist.stripeAccountId,
                },
            },
            metadata: {
                userId: req.userId.toString(),
                trackId: track._id.toString(),
            }
        });
        if (!session) {
            return res.status(500).json({ error: 'Failed to create checkout session' });
        }
        return res.status(200).json({ url: session.url });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        return res.status(500).json({ error: 'Failed to create checkout session' });
    }
});




router.get('/dashboard-data', authMiddleware, async (req, res) => {

    try {

        const user = await User.findById(req.userId).select('stripeAccountId stripeAccountStatus stripePayoutsEnabled stripeOnboardingComplete totalIncome amountOfTracksSold numOfCommissions');

        if (!user) {
            return res.status(404).json({ error: "The user has not been found or does not exist."});
        }

        return res.status(200).json({
            stripeAccountStatus: user.stripeAccountStatus,
            stripePayoutsEnabled: user.stripePayoutsEnabled,
            stripeOnboardingComplete: user.stripeOnboardingComplete,
            stripeAccountId: user.stripeAccountId,
            totalIncome: user.totalIncome || 0,
            amountOfTracksSold: user.amountOfTracksSold || 0,
            numOfCommissions: user.numOfCommissions || 0,
            hasStripeAccount: !!user.stripeAccountId

        })



    } catch (error) {

        console.error('Error fetching stripe dashboard data:', error);
        return res.status(500).json({ error: 'Failed to fetch Stripe dashboard' });
    }









})

router.post('/refresh-account-status', authMiddleware, async (req, res) => {
    console.log('[BACKEND] Refresh account status endpoint hit');
    try {
        const user = await User.findById(req.userId);
        console.log('[BACKEND] User found:', !!user, 'User ID:', req.userId);
        if (!user){
            return res.status(404).json({ error: 'User not found' });
        }
        if (!user.stripeAccountId) {
            return res.status(400).json({ error: 'User does not have a Stripe account' })
        }
        console.log('[BACKEND] User has Stripe account:', user.stripeAccountId);console.log('[Stripe Refresh] Refreshing account status for:', user.stripeAccountId);
            const account = await stripeClient.accounts.retrieve(user.stripeAccountId);
         user.stripeAccountStatus = account.charges_enabled ? 'active' : 'pending';
        user.stripePayoutsEnabled = account.payouts_enabled;
        user.stripeOnboardingComplete = account.details_submitted;
        
        await user.save();
        console.log('[Stripe Refresh] Account status updated:', {
            stripeAccountStatus: user.stripeAccountStatus,
            stripePayoutsEnabled: user.stripePayoutsEnabled,
            stripeOnboardingComplete: user.stripeOnboardingComplete
        });

        return res.status(200).json({ 
            success: true,
            accountStatus: user.stripeAccountStatus,
            payoutsEnabled: user.stripePayoutsEnabled,
            onboardingComplete: user.stripeOnboardingComplete
        });

    
} catch (error) {
    console.error('Error refreshing account status:', error);
    return res.status(500).json({ error: 'Failed to refresh account status' });
}

    
})

// Link existing Stripe account by account ID
router.post('/link-existing-account', authMiddleware, async (req, res) => {
    try {
        const { stripeAccountId } = req.body;

        if (!stripeAccountId || typeof stripeAccountId !== 'string') {
            return res.status(400).json({ error: 'Valid Stripe account ID is required' });
        }

        // Validate the account ID format
        if (!stripeAccountId.startsWith('acct_')) {
            return res.status(400).json({ error: 'Invalid Stripe account ID format. Should start with "acct_"' });
        }

        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user already has a Stripe account
        if (user.stripeAccountId) {
            return res.status(400).json({ error: 'User already has a linked Stripe account' });
        }        try {
            // Verify the account exists and get its details
            const account = await stripeClient.accounts.retrieve(stripeAccountId);
            
            // Check if it's a Connect account (not a regular Stripe account)
            if (!account.type || account.type === 'standard') {
                // This is good - Connect accounts can receive transfers
            } else {
                return res.status(400).json({ 
                    error: 'This appears to be a regular Stripe account. You need a Stripe Connect account to receive payouts. Please use "Create New Account" or "Connect Existing" instead.' 
                });
            }
            
            // Check if account is already linked to another user
            const existingUser = await User.findOne({ stripeAccountId: stripeAccountId });
            if (existingUser) {
                return res.status(400).json({ error: 'This Stripe account is already linked to another user' });
            }

            // Link the account
            user.stripeAccountId = stripeAccountId;
            user.stripeAccountStatus = account.charges_enabled ? 'active' : 'pending';
            user.stripePayoutsEnabled = account.payouts_enabled || false;
            user.stripeOnboardingComplete = account.details_submitted || false;
            
            await user.save();

            console.log(`[Stripe Link] Linked account ${stripeAccountId} to user ${user.email}`);

            return res.status(200).json({ 
                success: true,
                message: 'Stripe account linked successfully',
                accountStatus: user.stripeAccountStatus,
                payoutsEnabled: user.stripePayoutsEnabled,
                onboardingComplete: user.stripeOnboardingComplete
            });

        } catch (stripeError) {
            console.error('[Stripe Link] Error verifying account:', stripeError);
            return res.status(400).json({ 
                error: 'Invalid Stripe account ID or account not accessible. Please check the account ID and try again.' 
            });
        }

    } catch (error) {
        console.error('Error linking Stripe account:', error);
        return res.status(500).json({ error: 'Failed to link Stripe account' });
    }
});

// Reset/remove Stripe account link
router.post('/reset-account', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        console.log(`[Stripe Reset] Resetting Stripe account for user ${user.email}, current account: ${user.stripeAccountId}`);

        // Clear all Stripe-related fields
        user.stripeAccountId = null;
        user.stripeAccountStatus = null;
        user.stripePayoutsEnabled = false;
        user.stripeOnboardingComplete = false;
        
        await user.save();

        console.log(`[Stripe Reset] Successfully reset Stripe account for user ${user.email}`);

        return res.status(200).json({ 
            success: true,
            message: 'Stripe account reset successfully. You can now set up a new account.',
        });

    } catch (error) {
        console.error('Error resetting Stripe account:', error);
        return res.status(500).json({ error: 'Failed to reset Stripe account' });
    }
});

// Test endpoint to manually trigger money owed payouts (for development/testing)
router.post('/trigger-payouts', authMiddleware, async (req, res) => {
    try {
        console.log('[MANUAL PAYOUT] Manual payout trigger requested by user:', req.userId);
        
        // Import and run the payout process
        const { processPayouts } = await import('../utils/cron_payout_money_owed.js');
        await processPayouts();
        
        console.log('[MANUAL PAYOUT] Manual payout process completed');
        return res.status(200).json({ 
            success: true, 
            message: 'Payout process completed successfully' 
        });
    } catch (error) {
        console.error('[MANUAL PAYOUT] Error in manual payout trigger:', error);
        return res.status(500).json({ 
            error: 'Failed to process payouts',
            details: error.message 
        });
    }
});

// Verify and fulfill purchase if webhook failed
router.post('/verify-purchase', authMiddleware, async (req, res) => {
    console.log('[PURCHASE VERIFICATION] Starting verification for user:', req.userId);
    
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }

        // Retrieve the session from Stripe
        const session = await stripeClient.checkout.sessions.retrieve(sessionId);
        console.log('[PURCHASE VERIFICATION] Retrieved session:', session.id, 'status:', session.payment_status);

        if (session.payment_status !== 'paid') {
            return res.status(400).json({ 
                error: 'Payment not completed',
                status: session.payment_status 
            });
        }

        // Check if this purchase has already been processed
        const userId = session.metadata.userId;
        if (userId !== req.userId.toString()) {
            return res.status(403).json({ error: 'Session does not belong to current user' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        let alreadyProcessed = false;
        let tracksPurchased = [];

        // Handle cart purchase
        if (session.metadata && session.metadata.purchaseType === 'cart') {
            const trackIds = session.metadata.trackIds.split(',');
            const tracks = await BackingTrack.find({ _id: { $in: trackIds } });
            
            // Check if any of these tracks are already purchased
            for (const track of tracks) {
                const trackIdString = (track._id || track.id).toString();
                const existingPurchase = user.purchasedTracks.find(
                    p => p.track.toString() === trackIdString && p.paymentIntentId === session.payment_intent
                );
                
                if (existingPurchase) {
                    alreadyProcessed = true;
                } else {                    // Add the track to purchases
                    user.purchasedTracks.push({
                        track: track._id || track.id,
                        paymentIntentId: session.payment_intent,
                        purchasedAt: new Date(),
                        price: track.customerPrice, // ✅ Store customer price (what they actually paid)
                        refunded: false
                    });
                    
                    // Update track purchase count
                    track.purchaseCount = (track.purchaseCount || 0) + 1;
                    await track.save();
                    
                    tracksPurchased.push(track.title);
                    
                    // Process artist payouts (replicate webhook logic)
                    const artistPayouts = JSON.parse(session.metadata.artistPayouts);
                    for (const [artistId, payoutData] of Object.entries(artistPayouts)) {
                        const artist = await User.findById(artistId);
                        if (artist && payoutData.tracks.includes(trackIdString)) {
                            // Update artist stats
                            artist.amountOfTracksSold = (artist.amountOfTracksSold || 0) + 1;
                            artist.totalIncome = (artist.totalIncome || 0) + track.price;
                            
                            // Add to money owed
                            const reference = `Verification fulfillment: ${track.title} @ ${new Date().toLocaleDateString()}`;
                            const existingOwed = artist.moneyOwed.find(m => 
                                m.metadata?.paymentIntentId === session.payment_intent &&
                                m.metadata?.trackIds?.includes(trackIdString)
                            );
                            
                            if (!existingOwed) {
                                artist.moneyOwed.push({
                                    amount: track.price,
                                    reference: reference,
                                    source: 'purchase_verification',
                                    metadata: {
                                        type: 'track_purchase_payout',
                                        userId: userId,
                                        trackIds: trackIdString,
                                        purchaseType: 'cart',
                                        paymentIntentId: session.payment_intent,
                                        customerEmail: session.customer_email,
                                        payoutReason: 'Purchase verified and fulfilled'
                                    }
                                });
                            }
                            
                            await artist.save();
                        }
                    }
                }
            }
            
            // Clear cart
            user.cart = [];
        }
        // Handle individual track purchase
        else if (session.metadata && session.metadata.trackId) {
            const trackId = session.metadata.trackId;
            const track = await BackingTrack.findById(trackId);
            
            if (!track) {
                return res.status(404).json({ error: 'Track not found' });
            }
            
            // Check if already purchased
            const existingPurchase = user.purchasedTracks.find(
                p => p.track.toString() === trackId && p.paymentIntentId === session.payment_intent
            );
            
            if (existingPurchase) {
                alreadyProcessed = true;
            } else {                // Add the track to purchases
                user.purchasedTracks.push({
                    track: track._id,
                    paymentIntentId: session.payment_intent,
                    purchasedAt: new Date(),
                    price: track.customerPrice, // ✅ Store customer price (what they actually paid)
                    refunded: false
                });
                
                // Update track purchase count
                track.purchaseCount = (track.purchaseCount || 0) + 1;
                await track.save();
                
                tracksPurchased.push(track.title);
                
                // Process artist payout
                const artist = await User.findById(track.user);
                if (artist) {
                    artist.amountOfTracksSold = (artist.amountOfTracksSold || 0) + 1;
                    artist.totalIncome = (artist.totalIncome || 0) + track.price;
                    
                    // Add to money owed
                    const reference = `Verification fulfillment: ${track.title} @ ${new Date().toLocaleDateString()}`;
                    const existingOwed = artist.moneyOwed.find(m => 
                        m.metadata?.paymentIntentId === session.payment_intent &&
                        m.metadata?.trackIds === trackId
                    );
                    
                    if (!existingOwed) {
                        artist.moneyOwed.push({
                            amount: track.price,
                            reference: reference,
                            source: 'purchase_verification',
                            metadata: {
                                type: 'track_purchase_payout',
                                userId: userId,
                                trackIds: trackId,
                                purchaseType: 'individual',
                                paymentIntentId: session.payment_intent,
                                customerEmail: session.customer_email,
                                payoutReason: 'Purchase verified and fulfilled'
                            }
                        });
                    }
                    
                    await artist.save();
                }
            }
        }

        await user.save();

        if (alreadyProcessed && tracksPurchased.length === 0) {
            console.log('[PURCHASE VERIFICATION] Purchase already processed for session:', sessionId);
            return res.status(200).json({ 
                success: true, 
                message: 'Purchase already processed',
                alreadyProcessed: true
            });
        }

        console.log('[PURCHASE VERIFICATION] Purchase verified and fulfilled:', tracksPurchased);
        return res.status(200).json({ 
            success: true, 
            message: 'Purchase verified and access granted',
            tracksPurchased: tracksPurchased,
            alreadyProcessed: false
        });

    } catch (error) {
        console.error('[PURCHASE VERIFICATION] Error verifying purchase:', error);
        return res.status(500).json({ 
            error: 'Failed to verify purchase',
            details: error.message 
        });
    }
});

export default router;