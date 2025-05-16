import express from 'express';
import stripe from 'stripe';
import authMiddleware from '../middleware/customer_auth';
import User from '../models/User.js';

const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

router.post('/create-checkout-session', authMiddleware, async (req, res) => {
try {

    const {amount } = req.body;
    const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                price_data: {
                    currency: 'gbp',
                    product_data: {
                        name: 'Backing Track Purchase',
                    },
                    unit_amount: amount,
                },
                quantity: 1,
            },
        ],
        mode: 'payment',
        success_url: `${process.env.CLIENT_URL}/success`,
        cancel_url: `${process.env.CLIENT_URL}/cancel`,

    });
     if (! session) {
        return res.status(500).json({ error: "Failed to create checkout session"});
     }
     res.status(200).json({ url: session.url });



}catch(error) {

    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' }); 
}





});


router.post('/create-account-link', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (!user.stripeAccountId) {
            const account = await stripeClient.accounts.create({
                type: 'standard',
                country: 'GB',
                email: user.email,
                capabilities: {
                    transfers: { requested: true },
                }
            });
            user.stripeAccountId = account.id;
            await user.save();
        }
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

router.post('/checkout/artist/:trackId', authMiddleware, async (req, res) => {

    try {

        const track = await BackingTrack.getById(req.params.trackId);
        if (!track) {

            return res.status(404).json({error: 'Track not found'});
        }

        const artist = await User.findById(track.user);

        if(!artist || !artist.stripeAccountId) {
            return res.status(404).json({error: 'Artist either not found or does not have a stripe account'});
        }

         if (!track.price || isNaN(track.price)) {
            return res.status(400).json({error: 'Invalid track price'});
        }
        const price = track.price * 100; // convert to pence

        const session = await stripeClient.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                     price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: track.title,
                            description: track.description
                            //add image url later
                        },
                        unit_amount: price,

                     },
                     quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL}/cancel`,
            payment_intent_data: {
                application_fee_amount: Math.round(price * 0.1), // 10% fee
                transfer_data: {
                    destination: artist.stripeAccountId,
                },
            },

        });

        if (!session) {
            return res.status(500).json({error: 'failed to create checkout session'}); 
        }

        res.status(200).json({url: session.url});

    }catch(error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({error: 'Failed to create checkout session'});


    }



});

export default router;