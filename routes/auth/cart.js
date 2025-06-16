import express from 'express';
import authMiddleware from '../../middleware/customer_auth.js';
import { addToCart, removeFromCart, getCart, cleanCart } from '../../controllers/cart.js';

const router = express.Router();

console.log('[cart.js] Cart routes loaded');

// GET /auth/cart - Get user's cart
router.get('/', authMiddleware, getCart);

// POST /auth/cart/add - Add track to cart
router.post('/add', authMiddleware, addToCart);

// DELETE /auth/cart/remove/:trackId - Remove track from cart
router.delete('/remove/:trackId', authMiddleware, removeFromCart);

// POST /auth/cart/clean - Remove already purchased tracks from cart
router.post('/clean', authMiddleware, cleanCart);

// POST /auth/cart/clear - Clear entire cart (bonus route)
router.post('/clear', authMiddleware, async (req, res) => {
    try {
        const User = (await import('../../models/User.js')).default;
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        user.cart = [];
        await user.save();
        
        return res.status(200).json({ message: "Cart cleared successfully" });
    } catch (error) {
        console.error("Error clearing cart:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
