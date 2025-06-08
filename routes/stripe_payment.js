import express from 'express';
import stripe from 'stripe';
import authMiddleware from '../middleware/customer_auth.js';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';


const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

console.log('[stripe_payment.js] Router loaded');

// Helper: Validate MongoDB ObjectId
function isValidObjectId(id) {
    return typeof id === 'string' && id.match(/^[a-f\d]{24}$/i);
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
        console.log('[Stripe Onboarding] User after:', updatedUser);
        const accountLink = await stripeClient.accountLinks.create({
            account: user.stripeAccountId,
            refresh_url: `${process.env.CLIENT_URL}/reauth`,
            return_url: `${process.env.CLIENT_URL}/dashboard`,
            type: 'account_onboarding',
        });
        res.status(200).json({ url: accountLink.url });
    } catch (error) {
        console.error('Error creating account link:', error);
        res.status(500).json({ error: 'Failed to create account link' });
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
            ],
            mode: 'payment',
            success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL}/cancel`,
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

export default router;