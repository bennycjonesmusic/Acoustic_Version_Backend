import stripe from 'stripe';
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);
import BackingTrack from '../models/backing_track.js';
import CommissionRequest from '../models/CommissionRequest.js';
import User from '../models/User.js';
import { sendCommissionPreviewEmail } from '../utils/updateFollowers.js';
import { getAudioPreview } from '../utils/audioPreview.js';
import { validateUserForPayouts } from '../utils/stripeAccountStatus.js';
import { 
    createCommissionRequestNotification, 
    createCommissionAcceptedNotification, 
    createCommissionCompletedNotification 
} from '../utils/notificationHelpers.js';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { configDotenv } from 'dotenv';
import http from 'http';

configDotenv();

// Helper function to calculate expiry date based on delivery time string
const calculateExpiryDate = (createdAt, deliveryTimeString) => {
    const created = new Date(createdAt);
    
    // Parse the delivery time string (e.g., "2 weeks", "1 month", "3 days")
    const match = deliveryTimeString.match(/^(\d+)\s+(days?|weeks?|months?)$/i);
      if (!match) {
        // Default to 1 week if can't parse
        console.log(`[CRON] Warning: Could not parse delivery time "${deliveryTimeString}", defaulting to 1 week`);
        return new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    let milliseconds = 0;
    
    if (unit.startsWith('day')) {
        milliseconds = amount * 24 * 60 * 60 * 1000; // days to milliseconds
    } else if (unit.startsWith('week')) {
        milliseconds = amount * 7 * 24 * 60 * 60 * 1000; // weeks to milliseconds
    } else if (unit.startsWith('month')) {
        milliseconds = amount * 30 * 24 * 60 * 60 * 1000; // months to milliseconds (approximate)
    }
    
    return new Date(created.getTime() + milliseconds);
};

// Health check endpoint for Stripe webhook
export const stripeWebhookHealth = (req, res) => {
    return res.status(200).json({ status: 'ok' });
};

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
        // Health check for webhook before proceeding
        const webhookHealthUrl = 'http://localhost:3000/webhook/stripe/health';
        const healthCheck = await new Promise((resolve) => {
            http.get(webhookHealthUrl, (resp) => {
                resolve(resp.statusCode === 200);
            }).on('error', () => resolve(false));
        });
        if (!healthCheck) {
            return res.status(503).json({ error: 'Stripe webhook is not running. Please try again later.' });
        }

        const { artist: artistId, requirements, ...rest } = req.body;
        const customerId = req.userId;
        console.log('[createCommissionRequest] artistId:', artistId, 'customerId:', customerId, 'requirements:', requirements, 'rest:', rest);        // Fetch artist to get their commissionPrice
        const artist = await User.findById(artistId);
        console.log('[createCommissionRequest] artist lookup result:', artist);
        if (!artist) return res.status(404).json({ error: 'Artist not found' });
        
        // Validate artist's Stripe account before allowing commission creation
        const payoutValidation = validateUserForPayouts(artist);
        if (!payoutValidation.valid) {
            return res.status(400).json({ 
                error: `Commission cannot be created: ${payoutValidation.reason}. The artist must complete their Stripe account setup first.` 
            });
        }
          const artistPrice = Number(artist.commissionPrice) || 0;
        const customerPrice = Number(artist.customerCommissionPrice) || 0;
        
        console.log('[createCommissionRequest] artist.commissionPrice:', artist.commissionPrice);
        console.log('[createCommissionRequest] artist.customerCommissionPrice:', artist.customerCommissionPrice);
        
        if (!artistPrice || artistPrice <= 0) {
            return res.status(400).json({ error: 'No valid commission price set for this artist.' });
        }
        
        const commission = await CommissionRequest.create({
            customer: customerId,
            artist: artistId,
            requirements,
            price: customerPrice, // Use the schema-calculated customer price
            status: 'pending_artist',
            ...rest
        });
        console.log('[createCommissionRequest] created commission:', commission);

        // Notify artist immediately when commission is created
        try {
            await createCommissionRequestNotification(
                artistId,
                customerId,
                commission._id
            );
        } catch (notifError) {
            console.error('Error creating commission request notification:', notifError);
        }

        const session = await stripeClient.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: 'Custom Backing Track Commission Request',
                        },
                        unit_amount: Math.round(customerPrice * 100), // Convert to pence
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',            success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/commission/success/${commission._id}`,
            cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/commission/cancel/${commission._id}`,
            metadata: {
                commissionId: commission._id.toString(),
                customerId: customerId,
                artistId: artistId,
            }
        });
        console.log('[createCommissionRequest] stripe session:', session);
        console.log('[createCommissionRequest] session metadata:', session.metadata);
        commission.stripeSessionId = session.id;
        await commission.save();        // Respond with detailed price breakdown for transparency
        console.log('[createCommissionRequest] Response price breakdown:', { artistPrice, customerPrice });
        return res.status(200).json({
            sessionId: session.id,
            sessionUrl: session.url, // Add the Stripe Checkout URL for frontend/manual use
            commissionId: commission._id,
            artistPrice,
            customerPrice,
            platformCommission: customerPrice - artistPrice
        });
    }
    catch(error){
        console.error('[createCommissionRequest] Error creating commission request:', error, error.errors);
        return res.status(500).json({ error: "Internal server error" });
    }

}

// Approve commission and add to money owed queue for cron payout
export const approveCommissionAndPayout = async (req, res) => {
    const { commissionId } = req.body;
    const adminOrCustomerId = req.userId; // Only admin or the customer can approve

    try {
        const commission = await CommissionRequest.findById(commissionId).populate('artist customer');
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        
        // Only allow approval for delivered status, NOT cron_pending or paid
        if (commission.status !== 'delivered' && commission.status !== 'approved') {
            return res.status(400).json({ error: 'Commission not ready for approval' });
        }

        // Only customer or admin can approve
        if (
            commission.customer._id.toString() !== adminOrCustomerId &&
            !(req.user && req.user.role === 'admin')
        ) {
            return res.status(403).json({ error: 'Not authorized' });
        }        // Prevent double payout
        if (commission.status === 'completed' || commission.status === 'cron_pending') {
            return res.status(400).json({ error: 'Commission already processed or pending payout' });
        }// Check if payment has been received
        if (!commission.stripePaymentIntentId) {
            return res.status(400).json({ error: 'No payment intent found for this commission.' });
        }
        
        // Always set to approved - let webhook handle queueing when payment confirms
        commission.status = 'approved';
        await commission.save();
        
        const artist = commission.artist;
        if (!artist.stripeAccountId) {
            return res.status(400).json({ error: 'Artist has no Stripe account' });
        }

        // Calculate artist payout amount
        const artistPrice = Number(artist.commissionPrice) || 0;
        if (!artistPrice || artistPrice <= 0) {
            return res.status(400).json({ error: 'Invalid commission price' });
        }        // Add to money owed queue
        const moneyOwedEntry = {
            amount: artistPrice, // Amount in GBP (will be converted to pence in cron job)
            source: 'commission',
            reference: `Commission payout for commission ID: ${commission._id}`,
            commissionId: commission._id.toString(),
            createdAt: new Date(),
            metadata: {
                type: 'commission_payout',
                commissionId: commission._id.toString(),
                customerId: commission.customer._id.toString(),
                customerEmail: commission.customer.email,
                payoutReason: 'Commission completed and approved'
            }
        };

    console.log(`Money owed as follows:`, moneyOwedEntry);
        // Check if this commission is already in money owed to prevent duplicates
        const existingEntry = artist.moneyOwed.find(entry => 
            entry.commissionId && entry.commissionId === commission._id.toString()
        );

        if (existingEntry) {
            return res.status(400).json({ error: 'Commission already queued for payout' });
        }

        artist.moneyOwed.push(moneyOwedEntry);
        await artist.save();

        // Set commission to cron_pending since it's now queued
        commission.status = 'cron_pending';
        await commission.save();

        console.log(`[COMMISSION APPROVAL] Added £${artistPrice} to money owed queue for artist ${artist._id}, commission ${commission._id}`);

        return res.status(200).json({ 
            success: true, 
            message: 'Commission approved and queued for payout. Payment will be processed by the next scheduled payout run.' 
        });

    } catch (error) {
        console.error('Error approving commission:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Check for expired commissions and refund customer if deadline missed
export const processExpiredCommissions = async (req, res) => {
    try {
        const results = await processExpiredCommissionsStandalone();
        return res.status(200).json({ processed: results });
    } catch (error) {
        console.error('Error processing expired commissions:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Standalone version for cron job usage (no req/res dependencies)
export const processExpiredCommissionsStandalone = async () => {
    try {
        const now = new Date();
        
        // Find all commissions that are in progress and populate artist data
        const commissions = await CommissionRequest.find({
            status: { $in: ['requested', 'accepted', 'in_progress'] }
        }).populate('artist', 'maxTimeTakenForCommission username email');
        
        console.log(`[CRON] Found ${commissions.length} active commissions to check for expiry`);
        
        let expired = [];
        
        // Check each commission individually based on artist's delivery time
        for (const commission of commissions) {
            if (!commission.artist) {
                console.log(`[CRON] Skipping commission ${commission._id} - artist not found`);
                continue;
            }
              // Parse artist's delivery time (default to 1 week if not set)
            const deliveryTime = commission.artist.maxTimeTakenForCommission || '1 week';
            const expiryDate = calculateExpiryDate(commission.createdAt, deliveryTime);
            
            if (now > expiryDate) {
                expired.push(commission);
                console.log(`[CRON] Commission ${commission._id} expired (artist: ${commission.artist.username}, delivery time: ${deliveryTime})`);
            }
        }
        
        console.log(`[CRON] Found ${expired.length} expired commissions to process`);
          let results = [];
        for (const commission of expired) {
            // Only process refunds if payment was made AND successfully captured
            if (commission.stripePaymentIntentId) {
                try {
                    // First, verify the payment intent status to ensure money was actually received
                    const paymentIntent = await stripeClient.paymentIntents.retrieve(commission.stripePaymentIntentId);
                    
                    if (paymentIntent.status !== 'succeeded') {
                        console.log(`[CRON] Skipping refund for commission ${commission._id} - payment status: ${paymentIntent.status}`);
                        // Just cancel the commission without refunding since payment wasn't completed
                        commission.status = 'cancelled';
                        commission.cancellationReason = `Commission expired after ${commission.artist.maxTimeTakenForCommission || '1 week'} - payment not completed (${paymentIntent.status})`;
                        await commission.save();
                        results.push({ 
                            commissionId: commission._id, 
                            refunded: false,
                            reason: `Payment not completed (${paymentIntent.status})`,
                            deliveryTime: commission.artist.maxTimeTakenForCommission || '1 week',
                            artist: commission.artist.username
                        });
                        continue;
                    }
                    
                    // Verify the payment was captured (money actually received)
                    if (paymentIntent.charges?.data?.[0]?.captured !== true) {
                        console.log(`[CRON] Skipping refund for commission ${commission._id} - payment not captured`);
                        commission.status = 'cancelled';
                        commission.cancellationReason = `Commission expired after ${commission.artist.maxTimeTakenForCommission || '1 week'} - payment not captured`;
                        await commission.save();
                        results.push({ 
                            commissionId: commission._id, 
                            refunded: false,
                            reason: 'Payment not captured',
                            deliveryTime: commission.artist.maxTimeTakenForCommission || '1 week',
                            artist: commission.artist.username
                        });
                        continue;
                    }
                    
                    // Now we know the payment was successful and captured - safe to refund
                    await stripeClient.refunds.create({
                        payment_intent: commission.stripePaymentIntentId,
                        reason: 'requested_by_customer',
                        metadata: { 
                            commissionId: commission._id.toString(),
                            expiredAfter: commission.artist.maxTimeTakenForCommission || '1 week'
                        }
                    });
                    commission.status = 'cancelled';
                    commission.cancellationReason = `Commission expired after ${commission.artist.maxTimeTakenForCommission || '1 week'} - automatically refunded`;
                    await commission.save();
                    results.push({ 
                        commissionId: commission._id, 
                        refunded: true,
                        deliveryTime: commission.artist.maxTimeTakenForCommission || '1 week',
                        artist: commission.artist.username
                    });
                    console.log(`[CRON] Refunded commission ${commission._id} (expired after ${commission.artist.maxTimeTakenForCommission || '1 week'})`);
                } catch (err) {
                    results.push({
                        commissionId: commission._id, 
                        refunded: false, 
                        error: err.message,
                        deliveryTime: commission.artist.maxTimeTakenForCommission || '1 week',
                        artist: commission.artist.username
                    });
                    console.error(`[CRON] Failed to refund commission ${commission._id}:`, err.message);
                }
            } else {
                commission.status = 'cancelled';
                commission.cancellationReason = `Commission expired after ${commission.artist.maxTimeTakenForCommission || '1 week'} - no payment to refund`;
                await commission.save();
                results.push({ 
                    commissionId: commission._id, 
                    refunded: false, 
                    error: 'No payment intent',
                    deliveryTime: commission.artist.maxTimeTakenForCommission || '1 week',
                    artist: commission.artist.username
                });
                console.log(`[CRON] Cancelled commission ${commission._id} (expired after ${commission.artist.maxTimeTakenForCommission || '1 week'}, no payment intent)`);
            }
        }
        
        console.log(`[CRON] Processed ${results.length} expired commissions`);
        return results;
    } catch (error) {
        console.error('[CRON] Error processing expired commissions:', error);
        throw error;
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
        // --- 30-second preview logic (EXACT copy of tracksController) ---
        let previewUrl = null;
        const previewPath = tempFinishedPath + '-preview.mp3';
        try {
            // Write buffer to temp file for ffmpeg
            fs.writeFileSync(tempFinishedPath + '-full', req.file.buffer);
            await getAudioPreview(tempFinishedPath + '-full', previewPath, 30);
            // Use commissionId as the clean file name
            let cleanFileName = commissionId.toString().replace(/\.[^/.]+$/, '');
            const previewUploadParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `previews/${Date.now()}-${cleanFileName}.mp3`,
                Body: fs.createReadStream(previewPath),
                StorageClass: 'STANDARD',
                ContentType: 'audio/mpeg',
                ACL: 'public-read',
                CacheControl: 'public, max-age=3600, must-revalidate',
                Metadata: {
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD',
                    'Access-Control-Allow-Headers': 'Range, Content-Range'
                }
            };
            const previewData = await new Upload({ client: s3Client, params: previewUploadParams }).done();
            previewUrl = previewData.Location;
            // Clean up temp files
            fs.unlinkSync(previewPath);
            fs.unlinkSync(tempFinishedPath + '-full');
        } catch (err) {
            console.error('Error generating/uploading preview:', err);
            try { fs.existsSync(previewPath) && fs.unlinkSync(previewPath); } catch {}
            try { fs.existsSync(tempFinishedPath + '-full') && fs.unlinkSync(tempFinishedPath + '-full'); } catch {}
            previewUrl = null;
        }
        // --- end preview logic ---
        // Update commission
        const commissionToUpdate = await CommissionRequest.findById(commissionId).populate('customer artist');
        if (!commissionToUpdate) {
            return res.status(404).json({ error: 'Commission not found' });
        }        commissionToUpdate.finishedTrackUrl = finishedTrackUrl;
        commissionToUpdate.previewTrackUrl = previewUrl;
        commissionToUpdate.status = 'delivered';
        await commissionToUpdate.save();
          // Create notification for customer that commission is completed
        try {
            // Defensive coding: handle both _id and id fields
            const customerId = commissionToUpdate.customer._id || commissionToUpdate.customer.id;
            const commissionId = commissionToUpdate._id || commissionToUpdate.id;
            if (customerId && commissionId) {
                await createCommissionCompletedNotification(
                    customerId,
                    commissionToUpdate.artist.username,
                    commissionId
                );
            } else {
                console.error('Could not create commission completed notification: missing customer or commission ID');
            }
        } catch (notifError) {
            console.error('Error creating commission completed notification:', notifError);
        }
        
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
    // Get commission ID from URL params or request body (backward compatibility)
    const commissionId = req.params.id || req.body.commissionId;
    const { action } = req.body; // action: 'approve' or 'request_changes' (or legacy 'deny')
    const customerId = req.userId;
    
    if (!commissionId) {
        return res.status(400).json({ error: 'Commission ID is required' });
    }
    
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
            return res.status(200).json({ success: true, message: 'Commission approved. Artist will be paid out.' });        } else if (action === 'request_changes' || action === 'deny') {
            // Check if revisions are still allowed
            const currentRevisions = commission.revisionCount || 0;
            const maxRevisions = commission.maxRevisions || 2;
            
            if (currentRevisions >= maxRevisions) {
                return res.status(400).json({ 
                    error: `Maximum number of revisions (${maxRevisions}) has been reached. Commission cannot be revised further.`,
                    maxRevisionsReached: true
                });
            }
            
            // Save revision feedback if provided
            const { revisionFeedback } = req.body;
            if (revisionFeedback && revisionFeedback.trim()) {
                commission.revisionFeedback = revisionFeedback.trim();
            }
            
            // Increment revision count and set status back to in_progress
            commission.revisionCount = currentRevisions + 1;
            commission.status = 'in_progress'; // Allow artist to re-upload
            await commission.save();
            
            console.log('[confirmOrDenyCommission] Commission changes requested:', commissionId, 'Revision:', commission.revisionCount);
            return res.status(200).json({ 
                success: true, 
                message: `Changes requested (revision ${commission.revisionCount}/${maxRevisions}). Artist may re-upload.`,
                revisionCount: commission.revisionCount,
                maxRevisions: maxRevisions
            });
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
        }        // Only refund if not already refunded or completed
        if (commission.status === 'cancelled' || commission.status === 'completed') {
            return res.status(400).json({ error: 'Cannot refund this commission' });
        }
        // Refund via Stripe
        if (commission.stripePaymentIntentId) {
            try {
                await stripeClient.refunds.create({
                    payment_intent: commission.stripePaymentIntentId,
                    reason: 'requested_by_customer',                    metadata: { commissionId: commission._id.toString() }
                });
                commission.status = 'cancelled';
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
            // Check if artist can receive payouts before accepting commission
            const artist = await User.findById(artistId);
            const payoutValidation = validateUserForPayouts(artist);
            if (!payoutValidation.valid) {
                return res.status(403).json({ 
                    error: `Cannot accept commission: ${payoutValidation.reason}. Please complete your Stripe account setup to enable payouts.` 
                });
            }            commission.status = 'requested'; // Now customer can pay
            await commission.save();
              // Create notification for customer that commission was accepted
            try {
                // Defensive coding: handle both _id and id fields
                const customerId = commission.customer._id || commission.customer.id || commission.customer;
                const commissionId = commission._id || commission.id;
                if (customerId && commissionId) {
                    await createCommissionAcceptedNotification(
                        customerId,
                        artist.username,
                        commissionId
                    );
                } else {
                    console.error('Could not create commission accepted notification: missing customer or commission ID');
                }
            } catch (notifError) {
                console.error('Error creating commission accepted notification:', notifError);
            }
            
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
        
        // Pagination parameters with validation
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 20));
        const orderBy = req.query.orderBy || 'date-requested';
        
        // Build sort criteria based on orderBy parameter
        let sortCriteria;
        switch (orderBy) {
            case 'date-requested':
                sortCriteria = { createdAt: -1 };
                break;
            case 'date-updated':
                sortCriteria = { updatedAt: -1 };
                break;
            case 'price':
                sortCriteria = { price: -1 };
                break;
            case 'status':
                sortCriteria = { status: 1 };
                break;
            default:
                sortCriteria = { createdAt: -1 };
        }
        
        const skip = (page - 1) * limit;
        const [commissions, total] = await Promise.all([
            CommissionRequest.find({ artist: artistId })
                .populate('customer')
                .sort(sortCriteria)
                .skip(skip)
                .limit(limit),
            CommissionRequest.countDocuments({ artist: artistId })
        ]);
        
        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;
        
        return res.status(200).json({
            commissions,
            pagination: {
                currentPage: page,
                totalPages,
                totalCommissions: total,
                hasNextPage,
                hasPrevPage,
                limit
            }
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
        
        // Pagination parameters with validation
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 20));
        const orderBy = req.query.orderBy || 'date-requested';
        
        // Build sort criteria based on orderBy parameter
        let sortCriteria;
        switch (orderBy) {
            case 'date-requested':
                sortCriteria = { createdAt: -1 };
                break;
            case 'date-updated':
                sortCriteria = { updatedAt: -1 };
                break;
            case 'price':
                sortCriteria = { price: -1 };
                break;
            case 'status':
                sortCriteria = { status: 1 };
                break;
            default:
                sortCriteria = { createdAt: -1 };
        }
        
        const skip = (page - 1) * limit;
        const [commissions, total] = await Promise.all([
            CommissionRequest.find({ customer: customerId })
                .populate('artist')
                .sort(sortCriteria)
                .skip(skip)
                .limit(limit),
            CommissionRequest.countDocuments({ customer: customerId })
        ]);
        
        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;
        
        return res.status(200).json({
            commissions,
            pagination: {
                currentPage: page,
                totalPages,
                totalCommissions: total,
                hasNextPage,
                hasPrevPage,
                limit
            }
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
        if (commission.status !== 'pending_artist') return res.status(400).json({ error: 'Commission not awaiting artist response' });        if (action === 'approve') {
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
    console.log('[getFinishedCommission] commissionId:', commissionId); // Log commissionId for debugging
    try {
        const commission = await CommissionRequest.findById(commissionId);
        const artist = await User.findById(commission.artist); 
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        console.log('[getFinishedCommission] commission.artist:', commission.artist);
        if (commission.customer.toString() !== userId && !(req.user && req.user.role === 'admin')) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        if (commission.status !== 'completed' && commission.status !== 'approved') {
            return res.status(400).json({ error: 'Commission not completed or approved yet' });
        }
        if (!commission.finishedTrackUrl) return res.status(404).json({ error: 'No finished track available' });
        // Add to purchasedTracks if not already present
        const user = await User.findById(userId);
        let commissionPurchase = user.purchasedTracks.find(pt => pt.track?.toString() === commissionId);
        if (commissionPurchase && (!commissionPurchase.track || commissionPurchase.track === null)) {
            commissionPurchase.track = commissionId;
            commissionPurchase.commission = commission._id; // Set commission ref if missing
            await user.save();
        } else if (!commissionPurchase) {
            user.purchasedTracks.push({
                track: commissionId, // Always use commissionId as BackingTrack ref
                commission: commission._id, // Set commission ref
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

// TEST ROUTE: Manually trigger commission expiry processing for testing
export const testProcessExpiredCommissions = async (req, res) => {
    try {
        // Only allow in development or if explicitly enabled
        if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_TEST_ROUTES) {
            return res.status(403).json({ error: 'Test routes not enabled in production' });
        }
        
        console.log('[TEST] Manually triggering commission expiry processing...');
        const results = await processExpiredCommissionsStandalone();
        
        return res.status(200).json({ 
            message: 'Commission expiry processing completed',
            results: results,
            processedCount: results.length
        });
    } catch (error) {
        console.error('[TEST] Error processing expired commissions:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};

// TEST ROUTE: Create a test commission that appears expired for testing refund logic
export const createTestExpiredCommission = async (req, res) => {
    try {
        // Only allow in development or if explicitly enabled
        if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_TEST_ROUTES) {
            return res.status(403).json({ error: 'Test routes not enabled in production' });
        }
        
        const { artistId, customerId, paymentIntentId } = req.body;
        
        if (!artistId || !customerId) {
            return res.status(400).json({ error: 'artistId and customerId are required' });
        }
        
        // Create a commission that's "expired" (created 30 days ago)
        const expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() - 30); // 30 days ago
        
        const testCommission = new CommissionRequest({
            customer: customerId,
            artist: artistId,
            requirements: 'Test commission for refund testing',
            price: 25.00,
            status: 'accepted', // In progress status so it can be expired
            stripePaymentIntentId: paymentIntentId // Optional - if you want to test with real payment
        });
        
        await testCommission.save();
        
        console.log(`[TEST] Created test expired commission: ${testCommission._id}`);
        
        return res.status(201).json({
            message: 'Test expired commission created',
            commission: {
                id: testCommission._id,
                createdAt: testCommission.createdAt,
                status: testCommission.status,
                paymentIntentId: testCommission.stripePaymentIntentId
            }
        });
        
    } catch (error) {
        console.error('[TEST] Error creating test commission:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};

// TEST ROUTE: Make all active commissions appear expired for testing
export const makeAllCommissionsExpired = async (req, res) => {
    try {
        // Only allow in development or if explicitly enabled
        if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_TEST_ROUTES) {
            return res.status(403).json({ error: 'Test routes not enabled in production' });
        }
        
        // Find all active commissions that could potentially expire
        const activeCommissions = await CommissionRequest.find({
            status: { $in: ['requested', 'accepted', 'in_progress'] }
        }).populate('artist', 'maxTimeTakenForCommission username');
        
        console.log(`[TEST] Found ${activeCommissions.length} active commissions to make expired`);
        
        let updatedCount = 0;
        
        for (const commission of activeCommissions) {
            const deliveryTime = commission.artist?.maxTimeTakenForCommission || '1 week';
            
            // Calculate how far back to set the creation date to make it expired
            let daysToSubtract = 8; // Default to 8 days (more than 1 week)
            
            // Parse delivery time to determine how far back to set the date
            const match = deliveryTime.match(/^(\d+)\s+(days?|weeks?|months?)$/i);
            if (match) {
                const amount = parseInt(match[1]);
                const unit = match[2].toLowerCase();
                
                if (unit.startsWith('day')) {
                    daysToSubtract = amount + 1;
                } else if (unit.startsWith('week')) {
                    daysToSubtract = (amount * 7) + 1;
                } else if (unit.startsWith('month')) {
                    daysToSubtract = (amount * 30) + 1;
                }
            }
            
            // Set creation date to make the commission expired
            const expiredDate = new Date();
            expiredDate.setDate(expiredDate.getDate() - daysToSubtract);
            
            await CommissionRequest.findByIdAndUpdate(commission._id, {
                createdAt: expiredDate,
                updatedAt: expiredDate
            });
            
            updatedCount++;
            console.log(`[TEST] Made commission ${commission._id} expired (backdated by ${daysToSubtract} days for delivery time: ${deliveryTime})`);
        }
        
        return res.status(200).json({
            message: `Successfully made ${updatedCount} commissions appear expired`,
            updatedCommissions: updatedCount,
            details: activeCommissions.map(c => ({
                id: c._id,
                artist: c.artist?.username,
                deliveryTime: c.artist?.maxTimeTakenForCommission || '1 week',
                status: c.status
            }))
        });
        
    } catch (error) {
        console.error('[TEST] Error making commissions expired:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
