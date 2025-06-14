import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import mongoose from 'mongoose';


function isValidObjectId(id) {
    return typeof id === 'string' && id.match(/^[a-f\d]{24}$/i);
}

export const addToCart = async (req, res) => {
    try {
        console.log('🛒 addToCart: Request received');
        console.log('🛒 addToCart: req.userId:', req.userId);
        console.log('🛒 addToCart: req.body:', req.body);
        
        const { trackId } = req.body;
        
        // 🔒 Security: Validate trackId format
        if (!trackId || !isValidObjectId(trackId)) {
            console.log('🛒 addToCart: Invalid track ID:', trackId);
            return res.status(400).json({ message: "Invalid track ID" });
        }
        
        console.log('🛒 addToCart: Looking for user with ID:', req.userId);
        
        // 🔒 Security: Check if user exists
        const user = await User.findById(req.userId);
        if (!user) {
            console.log('🛒 addToCart: User not found for ID:', req.userId);
            return res.status(404).json({ message: "User not found" });
        }
        
        console.log('🛒 addToCart: User found:', user.username);
        console.log('🛒 addToCart: Looking for track with ID:', trackId);
        
        // 🔒 Security: Verify track exists and is available for purchase
        const track = await BackingTrack.findById(trackId);
        if (!track) {
            console.log('🛒 addToCart: Track not found for ID:', trackId);
            return res.status(404).json({ message: "Track not found" });
        }
        
        console.log('🛒 addToCart: Track found:', track.title);
        console.log('🛒 addToCart: Track owner:', track.user.toString());
        console.log('🛒 addToCart: Current user:', req.userId.toString());        // 🔒 Security: Prevent users from adding their own tracks to cart
        if (track.user.toString() === req.userId.toString()) {
            console.log('🛒 addToCart: User trying to add their own track');
            return res.status(400).json({ message: "You cannot add your own track to cart" });
        }
        
        console.log('🛒 addToCart: Current cart items:', user.cart.length);
        
        // 🔒 Security: Check if track is already in cart (use 'track' field, not 'trackId')
        if (!user.cart.some(item => item.track.toString() === trackId)) {
            user.cart.push({ track: trackId }); // addedAt will be set automatically
            await user.save();
            console.log('🛒 addToCart: Track added to cart successfully');
        } else {
            console.log('🛒 addToCart: Track already in cart');
        }

        console.log('🛒 addToCart: Final cart items:', user.cart.length);
        return res.status(200).json({ message: "Track added to cart successfully" });

    } catch (error) {
        console.error("🛒 addToCart: Error adding track to cart:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}



export const removeFromCart = async (req, res) => {
    try {
        const { trackId } = req.params;
        
        // 🔒 Security: Validate trackId format
        if (!trackId || !isValidObjectId(trackId)) {
            return res.status(400).json({ message: "Invalid track ID" });
        }
        
        // 🔒 Security: Check if user exists
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        // Remove from cart (use 'track' field, not 'trackId')
        const initialCartLength = user.cart.length;
        user.cart = user.cart.filter(item => item.track.toString() !== trackId);
        
        // 🔒 Security: Check if item was actually removed
        if (user.cart.length === initialCartLength) {
            return res.status(404).json({ message: "new track not found in cart" });
        }
        
        await user.save();
        return res.status(200).json({ message: "Track removed from cart successfully" });
        
    } catch (error) {
        console.error("Error removing track from cart:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

export const getCart = async (req, res) => {
    try {
        // 🔒 Security: Check if user exists
        const user = await User.findById(req.userId).populate('cart.track');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }        // 🔒 Security: Filter out any invalid/deleted tracks from cart
        const validCartItems = user.cart.filter(item => item.track && (item.track._id || item.track.id));
        
        // If cart was cleaned up, save the user
        if (validCartItems.length !== user.cart.length) {
            user.cart = validCartItems;
            await user.save();
        }

        return res.status(200).json({ cart: validCartItems });
        
    } catch (error) {
        console.error("Error fetching cart:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}