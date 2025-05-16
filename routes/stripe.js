import express from 'express';
import stripe from 'stripe';
import authMiddleware from '../middleware/customer_auth';

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
                    currency: 'usd',
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

export default router;