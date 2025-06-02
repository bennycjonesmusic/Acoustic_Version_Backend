import CommissionRequest from "../models/CommissionRequest.js";
import stripe from 'stripe';
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);
import BackingTrack from '../models/backing_track.js';
import User from '../models/User.js';
import { sendCommissionPreviewEmail } from '../utils/updateFollowers.js';
import { getAudioPreview } from '../utils/audioPreview.js';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import path from 'path';
import fs from 'fs';

//in wrong place
// Admin-only: Issue a refund for a regular track purchase (not commission)
export const refundTrackPurchase = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const { userId, trackId } = req.body;
        console.log('[REFUND DEBUG] Incoming userId:', userId, 'trackId:', trackId, 'typeof userId:', typeof userId);
        if (!userId || !trackId) {
            return res.status(400).json({ error: 'Missing userId or trackId' });
        }
        // Find user and purchase record
        const user = await User.findById(userId);
        console.log('[REFUND DEBUG] User found:', !!user, user ? user._id : null);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const purchase = user.purchasedTracks.find(
            p => p.track.equals(trackId) && !p.refunded
        );
        if (!purchase) {
            return res.status(400).json({ error: 'No active purchase found for this track' });
        }
        // Issue refund
        const refund = await stripeClient.refunds.create({
            payment_intent: purchase.paymentIntentId,
            reason: 'requested_by_customer',
            metadata: { userId, trackId }
        });
        // Check refund status
        if (refund.status !== 'succeeded' && refund.status !== 'pending') {
            return res.status(500).json({ error: 'Stripe refund failed', refund });
        }

               const index = user.purchasedTracks.findIndex(pt => pt.track.equals(trackId) && !pt.refunded);
        if (index !== -1) {
            user.purchasedTracks.splice(index, 1); //remove purchase from users tracks
            await user.save();
        }
        // Mark as refunded
        purchase.refunded = true;
        await user.save();

 

        // Notify user by email (use shared email utility)
        try {
            const { sendRefundNotificationEmail } = await import('../utils/emailAuthentication.js');
            await sendRefundNotificationEmail(user.email, trackId, refund.status);
        } catch (mailErr) {
            console.error('Failed to send refund notification email:', mailErr);
        }

        return res.status(200).json({ success: true, refund });
    } catch (error) {
        console.error('Error issuing track refund:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const createCommissionRequest = async (req, res) => {
    try {
        const { artist: artistId, requirements, ...rest } = req.body;
        const customerId = req.userId;
        console.log('[createCommissionRequest] artistId:', artistId, 'customerId:', customerId, 'requirements:', requirements, 'rest:', rest);
        // Fetch artist to get their commissionPrice
        const artist = await User.findById(artistId);
        console.log('[createCommissionRequest] artist lookup result:', artist);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });
        const artistPrice = Number(artist.commissionPrice) || 0;
        const platformCommissionRate = 0.15; // 15% platform fee
        const platformCommission = Math.round(artistPrice * platformCommissionRate * 100) / 100; // round to 2 decimals
        const finalPrice = Math.round((artistPrice + platformCommission) * 100) / 100;
        console.log('[createCommissionRequest] artist.commissionPrice:', artist.commissionPrice);
        console.log('[createCommissionRequest] platformCommission:', platformCommission);
        console.log('[createCommissionRequest] finalPrice (customer pays):', finalPrice);
        if (!artistPrice || artistPrice <= 0) {
            return res.status(400).json({ error: 'No valid commission price set for this artist.' });
        }
        const commission = await CommissionRequest.create({
            customer: customerId,
            artist: artistId,
            requirements,
            price: finalPrice,
            status: 'pending_artist',
            ...rest
        });
        console.log('[createCommissionRequest] created commission:', commission);

        const session = await stripeClient.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: 'Custom Backing Track Commission Request',
                        },
                        unit_amount: Math.round(finalPrice * 100), // Convert to pence
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/commission/success/${commission._id}`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/commission/cancel/${commission._id}`,
            metadata: {
                commissionId: commission._id.toString(),
                customerId: customerId,
                artistId: artistId,
            }
        });
        console.log('[createCommissionRequest] stripe session:', session);
        console.log('[createCommissionRequest] session metadata:', session.metadata);
        commission.stripeSessionId = session.id;
        await commission.save();

        // Respond with detailed price breakdown for transparency
        console.log('[createCommissionRequest] Response price breakdown:', { artistPrice, platformCommission, finalPrice });
        return res.status(200).json({
            sessionId: session.id,
            sessionUrl: session.url, // Add the Stripe Checkout URL for frontend/manual use
            commissionId: commission._id,
            artistPrice,
            platformCommission,
            finalPrice
        });
    }
    catch(error){
        console.error('[createCommissionRequest] Error creating commission request:', error, error.errors);
        return res.status(500).json({ error: "Internal server error" });
    }

}

// Approve commission and pay out artist
export const approveCommissionAndPayout = async (req, res) => {
    const { commissionId } = req.body;
    const adminOrCustomerId = req.userId; // Only admin or the customer can approve

    try {
        const commission = await CommissionRequest.findById(commissionId).populate('artist customer');
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        // Only allow payout for delivered or approved, NOT cron_pending
        if (commission.status !== 'delivered' && commission.status !== 'approved') {
            return res.status(400).json({ error: 'Commission not ready for approval' });
        }

        // Only customer or admin can approve
        if (
            commission.customer._id.toString() !== adminOrCustomerId &&
            !(req.user && req.user.role === 'admin')
        ) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Prevent double payout
        if (commission.status === 'paid') {
            return res.status(400).json({ error: 'Already paid out' });
        }

        // Check if payment has been received
        if (!commission.stripePaymentIntentId) {
            return res.status(400).json({ error: 'No payment intent found for this commission.' });
        }
        const paymentIntent = await stripeClient.paymentIntents.retrieve(commission.stripePaymentIntentId);
        if (paymentIntent.status !== 'succeeded') {
            // Payment not received yet, mark as cron_pending and let cron handle payout
            commission.status = 'cron_pending';
            await commission.save();
            return res.status(200).json({ success: true, message: 'Commission approved. Payout will be processed once payment is received.' });
        }

        // Payment received, proceed with payout logic
        const artist = commission.artist;
        if (!artist.stripeAccountId) {
            return res.status(400).json({ error: 'Artist has no Stripe account' });
        }
        if (artist.role !== 'artist' && artist.role !== 'admin') {
            return res.status(403).json({ error: 'Payouts are only allowed to users with role artist or admin.' });
        }
        // Guarantee artist receives their set price
        const artistPrice = Number(artist.commissionPrice) || 0;
        const platformCommissionRate = 0.15; // 15% platform fee
        const platformFee = Math.round(artistPrice * platformCommissionRate * 100); // pence
        const artistAmount = Math.round(artistPrice * 100); // pence
        const totalAmount = artistAmount + platformFee; // for reference
        console.log('[PAYOUT DEBUG]', {
            commissionId: commission._id.toString(),
            totalAmount,
            platformFee,
            artistAmount,
            artistStripeAccount: artist.stripeAccountId
        });

        // Transfer to artist
        const transfer = await stripeClient.transfers.create({
            amount: artistAmount,
            currency: 'gbp',
            destination: artist.stripeAccountId,
            transfer_group: `commission_${commission._id}`,
            metadata: {
                commissionId: commission._id.toString(),
                artistId: artist._id.toString(),
            }
        });

        commission.status = 'paid';
        commission.stripeTransferId = transfer.id;
        await commission.save();

        return res.status(200).json({ success: true, transferId: transfer.id });
    } catch (error) {
        console.error('Error approving commission and paying out:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Check for expired commissions and refund customer if deadline missed
export const processExpiredCommissions = async (req, res) => {
    try {
        const now = new Date();
        // Set expiry threshold to 2 weeks (14 days) from commission creation
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        // Find commissions created more than 2 weeks ago, not delivered, paid, refunded, or cancelled
        const expired = await CommissionRequest.find({
            createdAt: { $lt: twoWeeksAgo },
            status: { $in: ['requested', 'accepted', 'in_progress'] }
        });
        let results = [];
        for (const commission of expired) {
            // Refund via Stripe if payment was made
            if (commission.stripePaymentIntentId) {
                try {
                    await stripeClient.refunds.create({
                        payment_intent: commission.stripePaymentIntentId,
                        reason: 'requested_by_customer',
                        metadata: { commissionId: commission._id.toString() }
                    });
                    commission.status = 'refunded';
                    await commission.save();
                    results.push({ commissionId: commission._id, refunded: true });
                } catch (err) {
                    results.push({ commissionId: commission._id, refunded: false, error: err.message });
                }
            } else {
                commission.status = 'cancelled';
                await commission.save();
                results.push({ commissionId: commission._id, refunded: false, error: 'No payment intent' });
            }
        }
        return res.status(200).json({ processed: results });
    } catch (error) {
        console.error('Error processing expired commissions:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Artist uploads finished track for commission
export const uploadFinishedTrack = async (req, res) => {
    try {
        // Only keep essential logs
        const { commissionId } = req.body;
        if (!commissionId) {
            return res.status(400).json({ error: 'Missing commissionId' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const ext = path.extname(req.file.originalname);
        const finishedKey = `${commissionId}_finished${ext}`;
        const previewKey = `${commissionId}_preview${ext}`;
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        // Write finished track buffer to temp file and upload via stream
        const tmp = await import('os');
        const tmpDir = tmp.tmpdir();
        const tempFinishedPath = path.join(tmpDir, `${commissionId}_finished${ext}`);
        fs.writeFileSync(tempFinishedPath, req.file.buffer);
        let finishedUploadResult;
        try {
            finishedUploadResult = await new Upload({
                client: s3Client,
                params: {
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: finishedKey,
                    Body: fs.createReadStream(tempFinishedPath),
                    ACL: 'private',
                    ContentType: req.file.mimetype,
                },
            }).done();
        } catch (s3Err) {
            return res.status(500).json({ error: 'Failed to upload finished track to S3', details: s3Err.message });
        }
        try { fs.existsSync(tempFinishedPath) && fs.unlinkSync(tempFinishedPath); } catch (e) {}
        const finishedTrackUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${finishedKey}`;
        // Generate 30s preview using shared utility
        let tempFullPath, tempPreviewPath;
        try {
            tempFullPath = path.join(tmpDir, `${commissionId}_full${ext}`);
            tempPreviewPath = path.join(tmpDir, `${commissionId}_preview.mp3`);
            fs.writeFileSync(tempFullPath, req.file.buffer);
            // Debug: check file size and buffer length
            console.log('[DEBUG] tempFullPath:', tempFullPath, 'size:', fs.statSync(tempFullPath).size, 'buffer length:', req.file.buffer.length);
            // Try running ffmpeg manually if this fails
            await getAudioPreview(tempFullPath, tempPreviewPath, 30);
            // Debug: check preview file size
            if (fs.existsSync(tempPreviewPath)) {
              console.log('[DEBUG] tempPreviewPath:', tempPreviewPath, 'size:', fs.statSync(tempPreviewPath).size);
            } else {
              console.error('[DEBUG] tempPreviewPath was not created!');
            }
            try {
                await new Upload({
                    client: s3Client,
                    params: {
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: previewKey,
                        Body: fs.createReadStream(tempPreviewPath),
                        ACL: 'private',
                        ContentType: req.file.mimetype,
                    },
                }).done();
            } catch (s3Err) {
                return res.status(500).json({ error: 'Failed to upload preview to S3', details: s3Err.message });
            }
        } catch (previewErr) {
            return res.status(500).json({ error: 'Failed to generate preview', details: previewErr.message });
        }
        try { fs.existsSync(tempFullPath) && fs.unlinkSync(tempFullPath); } catch (e) {}
        try { fs.existsSync(tempPreviewPath) && fs.unlinkSync(tempPreviewPath); } catch (e) {}
        // Update commission
        const commissionToUpdate = await CommissionRequest.findById(commissionId).populate('customer artist');
        if (!commissionToUpdate) {
            return res.status(404).json({ error: 'Commission not found' });
        }
        commissionToUpdate.finishedTrackUrl = finishedTrackUrl;
        commissionToUpdate.previewTrackUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${previewKey}`;
        commissionToUpdate.status = 'delivered';
        await commissionToUpdate.save();
        // Send preview email to customer
        if (commissionToUpdate.customer && commissionToUpdate.customer.email && commissionToUpdate.artist) {
            sendCommissionPreviewEmail(
                commissionToUpdate.customer.email,
                commissionToUpdate.artist,
                commissionToUpdate
            ).catch(e => console.error('Commission preview email error:', e));
        }
        return res.status(200).json({
            success: true,
            finishedTrackUrl: commissionToUpdate.finishedTrackUrl,
            previewTrackUrl: commissionToUpdate.previewTrackUrl
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message || err });
    }
};

// Customer confirms or denies preview
export const confirmOrDenyCommission = async (req, res) => {
    const { commissionId, action } = req.body; // action: 'approve' or 'deny'
    const customerId = req.userId;
    try {
        const commission = await CommissionRequest.findById(commissionId);
        console.log('[confirmOrDenyCommission] Loaded commission:', commission);
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        if (commission.customer.toString() !== customerId) return res.status(403).json({ error: 'Not authorized' });
        if (commission.status !== 'delivered') {
            console.log('[confirmOrDenyCommission] Not ready for confirmation. Status:', commission.status);
            return res.status(400).json({ error: 'Not ready for confirmation' });
        }
        if (action === 'approve') {
            commission.status = 'approved';
            await commission.save();
            console.log('[confirmOrDenyCommission] Commission approved:', commissionId);
            return res.status(200).json({ success: true, message: 'Commission approved. Artist will be paid out.' });
        } else if (action === 'deny') {
            commission.status = 'in_progress'; // Allow artist to re-upload
            await commission.save();
            console.log('[confirmOrDenyCommission] Commission denied:', commissionId);
            return res.status(200).json({ success: true, message: 'Commission denied. Artist may re-upload.' });
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Error confirming/denying commission:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Admin-only: Refund a commission (not a regular track purchase)
export const refundCommission = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const { commissionId } = req.body;
        if (!commissionId) {
            return res.status(400).json({ error: 'Missing commissionId' });
        }
        const commission = await CommissionRequest.findById(commissionId);
        if (!commission) {
            return res.status(404).json({ error: 'Commission not found' });
        }
        // Only refund if not already refunded or paid
        if (commission.status === 'refunded' || commission.status === 'paid') {
            return res.status(400).json({ error: 'Cannot refund this commission' });
        }
        // Refund via Stripe
        if (commission.stripePaymentIntentId) {
            try {
                await stripeClient.refunds.create({
                    payment_intent: commission.stripePaymentIntentId,
                    reason: 'requested_by_customer',
                    metadata: { commissionId: commission._id.toString() }
                });
                commission.status = 'refunded';
                await commission.save();
                return res.status(200).json({ success: true });
            } catch (err) {
                return res.status(500).json({ error: 'Failed to issue refund', details: err.message });
            }
        } else {
            return res.status(400).json({ error: 'No payment intent found for this commission' });
        }
    } catch (error) {
        console.error('Error refunding commission:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Artist accepts or rejects a commission
export const artistRespondToCommission = async (req, res) => {
    const { commissionId, action } = req.body; // action: 'accept' or 'reject'
    const artistId = req.userId;
    try {
        const commission = await CommissionRequest.findById(commissionId);
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        if (commission.artist.toString() !== artistId) return res.status(403).json({ error: 'Not authorized' });
        if (commission.status !== 'pending_artist') return res.status(400).json({ error: 'Commission not awaiting artist response' });
        if (action === 'accept') {
            commission.status = 'requested'; // Now customer can pay
            await commission.save();
            return res.status(200).json({ success: true, message: 'Commission accepted. Awaiting customer payment.' });
        } else if (action === 'reject') {
            commission.status = 'rejected_by_artist';
            await commission.save();
            return res.status(200).json({ success: true, message: 'Commission rejected.' });
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Error in artistRespondToCommission:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Get all commissions for the logged-in artist
export const getArtistCommissions = async (req, res) => {
    try {
        const artistId = req.userId;
        // Pagination
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const [commissions, total] = await Promise.all([
            CommissionRequest.find({ artist: artistId })
                .populate('customer')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            CommissionRequest.countDocuments({ artist: artistId })
        ]);
        return res.status(200).json({
            commissions,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching artist commissions:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Get all commissions for the logged-in customer (secure)
export const getCustomerCommissions = async (req, res) => {
    try { //Now paginated for better performance
        const customerId = req.userId;
        // Only allow the user themselves or admin
        if (!req.user || (req.user.id.toString() !== customerId && req.user.role !== 'admin')) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        // Pagination
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const [commissions, total] = await Promise.all([
            CommissionRequest.find({ customer: customerId })
                .populate('artist')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            CommissionRequest.countDocuments({ customer: customerId })
        ]);
        return res.status(200).json({
            commissions,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching customer commissions:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Approve or deny a commission (artist only)
export const approveOrDenyCommission = async (req, res) => {
    const { commissionId, action } = req.body; // action: 'approve' or 'deny'
    const artistId = req.userId;
    try {
        const commission = await CommissionRequest.findById(commissionId);
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        if (commission.artist.toString() !== artistId) return res.status(403).json({ error: 'Not authorized' });
        if (commission.status !== 'pending_artist') return res.status(400).json({ error: 'Commission not awaiting artist response' });
        if (action === 'approve') {
            commission.status = 'requested'; // Now customer can pay
            await commission.save();
            return res.status(200).json({ success: true, message: 'Commission approved. Awaiting customer payment.' });
        } else if (action === 'deny') {
            commission.status = 'rejected_by_artist';
            await commission.save();
            return res.status(200).json({ success: true, message: 'Commission denied.' });
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Error in approveOrDenyCommission:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Get preview for client (authenticated customer only)
export const getCommissionPreviewForClient = async (req, res) => {
    const { commissionId } = req.query;
    const userId = req.userId;
    try {
        const commission = await CommissionRequest.findById(commissionId);
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        if (commission.customer.toString() !== userId && !(req.user && req.user.role === 'admin')) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        if (!commission.previewTrackUrl) return res.status(404).json({ error: 'No preview available' });
        return res.status(200).json({ previewTrackUrl: commission.previewTrackUrl });
    } catch (err) {
        return res.status(500).json({ error: 'Internal server error', details: err.message || err });
    }
};

// Get finished commission and add to purchasedTracks (customer only, after payment)
export const getFinishedCommission = async (req, res) => {
    const { commissionId } = req.query;
    const userId = req.userId;
    try {
        const commission = await CommissionRequest.findById(commissionId);
        const artist = await User.findById(commission.artist); 
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        if (commission.customer.toString() !== userId && !(req.user && req.user.role === 'admin')) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        if (commission.status !== 'paid') {
            return res.status(400).json({ error: 'Commission not paid for yet' });
        }
        if (!commission.finishedTrackUrl) return res.status(404).json({ error: 'No finished track available' });
        // Add to purchasedTracks if not already present
        const user = await User.findById(userId);
        const alreadyPurchased = user.purchasedTracks.some(pt => pt.track?.toString() === commissionId);
        if (!alreadyPurchased) {
            user.purchasedTracks.push({
                track: commissionId, // Use commissionId as a marker
                paymentIntentId: commission.stripePaymentIntentId || 'commission',
                purchasedAt: new Date(),
                price: commission.price || 0,
                refunded: false
            });
            await user.save();
            artist.numOfCommissions = (artist.numOfCommissions || 0) + 1; 
            await artist.save();// Increment artist's commission count
        }
        return res.status(200).json({ finishedTrackUrl: commission.finishedTrackUrl });
    } catch (err) {
        return res.status(500).json({ error: 'Internal server error', details: err.message || err });
    }
};

// Cancel a commission (customer only, with reason, before delivery/payout)
export const cancelCommission = async (req, res) => {
    const { commissionId, reason } = req.body;
    const userId = req.userId;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        return res.status(400).json({ error: 'A valid cancellation reason is required.' });
    }
    try {
        const commission = await CommissionRequest.findById(commissionId);
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        if (commission.customer.toString() !== userId && !(req.user && req.user.role === 'admin')) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        // Only allow cancellation/refund during preview phase (status === 'delivered')
        if (commission.status !== 'delivered') {
            return res.status(400).json({ error: 'Can only cancel/refund during the preview phase (after preview upload, before approval/payout).' });
        }
        if (!commission.stripePaymentIntentId) {
            return res.status(400).json({ error: 'No payment to refund.' });
        }
        // Process Stripe refund
        try {
            await stripeClient.refunds.create({
                payment_intent: commission.stripePaymentIntentId,
                reason: 'requested_by_customer',
                metadata: { commissionId: commission._id.toString(), reason }
            });
            commission.status = 'cancelled';
            commission.cancellationReason = reason;
            await commission.save();
            return res.status(200).json({ success: true, message: 'Commission cancelled and refunded.' });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to issue refund', details: err.message });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getCommissionById = async (req, res) => {
  try {
    const CommissionRequest = (await import('../models/CommissionRequest.js')).default;
    const commission = await CommissionRequest.findById(req.params.id).populate('artist customer');
    if (!commission) return res.status(404).json({ error: 'Commission not found' });
    // Only allow access if user is the customer, artist, or admin
    const userId = req.userId;
    const isAdmin = req.user && req.user.role === 'admin';
    if (
      commission.customer._id.toString() !== userId &&
      commission.artist._id.toString() !== userId &&
      !isAdmin
    ) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    return res.status(200).json(commission);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error', details: err.message || err });
  }
};
