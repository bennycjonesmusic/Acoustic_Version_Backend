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

// Admin-only: Issue a refund for a regular track purchase (not commission)
export const refundTrackPurchase = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const { userId, trackId } = req.body;
        if (!userId || !trackId) {
            return res.status(400).json({ error: 'Missing userId or trackId' });
        }
        // Find user and purchase record
        const user = await User.findById(userId);
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
        // Mark as refunded
        purchase.refunded = true;
        await user.save();
        return res.status(200).json({ success: true, refund });
    } catch (error) {
        console.error('Error issuing track refund:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const createCommissionRequest = async (req, res) => {
    try {
        const { artist: artistId, requirements, price, ...rest } = req.body;
        const customerId = req.userId;
        // Fetch artist to get their commissionPrice if price not provided
        const artist = await User.findById(artistId);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });
        let finalPrice = price;
        if (typeof finalPrice !== 'number' || isNaN(finalPrice) || finalPrice <= 0) {
            finalPrice = artist.commissionPrice || 0;
        }
        if (!finalPrice || finalPrice <= 0) {
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
            success_url: `${process.env.FRONTEND_URL}/commission/success/${commission._id}`,
            cancel_url: `${process.env.FRONTEND_URL}/commission/cancel/${commission._id}`,
            metadata: {
                commissionId: commission._id.toString(),
                customerId: customerId,
                artistId: artistId,
            }


        });
        commission.stripeSessionId = session.id;
        await commission.save();

        return res.status(200).json({
            sessionId: session.id,
            commissionId: commission._id,
        });
    }
    catch(error){
        console.error("Error creating commission request:", error);
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
        if (commission.status !== 'delivered') return res.status(400).json({ error: 'Commission not ready for approval' });

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

        const artist = commission.artist;
        if (!artist.stripeAccountId) {
            return res.status(400).json({ error: 'Artist has no Stripe account' });
        }
        // Only allow payout if artist is 'artist' or 'admin'
        if (artist.role !== 'artist' && artist.role !== 'admin') {
            return res.status(403).json({ error: 'Payouts are only allowed to users with role artist or admin.' });
        }
        // Calculate payout (e.g. 15% platform fee)
        const totalAmount = Math.round(commission.price * 100); // pence
        const platformFee = Math.round(totalAmount * 0.15); // 15% fee
        const artistAmount = totalAmount - platformFee;

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
            tempPreviewPath = path.join(tmpDir, `${commissionId}_preview${ext}`);
            fs.writeFileSync(tempFullPath, req.file.buffer);
            await getAudioPreview(tempFullPath, tempPreviewPath, 30);
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
