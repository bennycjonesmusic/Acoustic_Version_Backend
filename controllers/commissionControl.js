import CommissionRequest from "../models/commission_request";
import User from "../models/User"; 
import stripe from 'stripe';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

const stripeClient = stripe(process.env.STRIPE_SECRET_KEY); //process the stripe secret key

export const createCommissionRequest = async (req, res) => {

    const { artistId, requirements, price } = req.body;
    const customerId = req.userId;

    try {
        const commission = await CommissionRequest.create({
            customer: customerId,
            artist: artistId,
            requirements,
            price,


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
                        unit_amount: Math.round(price * 100), // Convert to pence
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
        // Find commissions past expiry, not delivered or paid or cancelled
        const expired = await CommissionRequest.find({
            expiryDate: { $lt: now },
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
                    commission.status = 'cancelled';
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
    const commissionId = req.body.commissionId;
    const artistId = req.userId;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const commission = await CommissionRequest.findById(commissionId);
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        if (commission.artist.toString() !== artistId) return res.status(403).json({ error: 'Not authorized' });
        if (!['accepted', 'in_progress'].includes(commission.status)) return res.status(400).json({ error: 'Commission not in progress' });

        // Save file to /uploads/commissions/
        const uploadsDir = path.join(process.cwd(), 'uploads', 'commissions');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const ext = path.extname(req.file.originalname);
        const fileName = `${commissionId}_finished${ext}`;
        const filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, req.file.buffer);

        // Generate 30s preview using ffmpeg
        const previewName = `${commissionId}_preview${ext}`;
        const previewPath = path.join(uploadsDir, previewName);
        await new Promise((resolve, reject) => {
            ffmpeg(filePath)
                .setStartTime(0)
                .duration(30)
                .output(previewPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        commission.finishedTrackUrl = `/uploads/commissions/${fileName}`;
        commission.previewTrackUrl = `/uploads/commissions/${previewName}`;
        commission.status = 'delivered';
        await commission.save();

        return res.status(200).json({
            success: true,
            finishedTrackUrl: commission.finishedTrackUrl,
            previewTrackUrl: commission.previewTrackUrl
        });
    } catch (error) {
        console.error('Error uploading finished track:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Customer confirms or denies preview
export const confirmOrDenyCommission = async (req, res) => {
    const { commissionId, action } = req.body; // action: 'approve' or 'deny'
    const customerId = req.userId;
    try {
        const commission = await CommissionRequest.findById(commissionId);
        if (!commission) return res.status(404).json({ error: 'Commission not found' });
        if (commission.customer.toString() !== customerId) return res.status(403).json({ error: 'Not authorized' });
        if (commission.status !== 'delivered') return res.status(400).json({ error: 'Not ready for confirmation' });
        if (action === 'approve') {
            commission.status = 'approved';
            await commission.save();
            return res.status(200).json({ success: true, message: 'Commission approved. Artist will be paid out.' });
        } else if (action === 'deny') {
            commission.status = 'in_progress'; // Allow artist to re-upload
            await commission.save();
            return res.status(200).json({ success: true, message: 'Commission denied. Artist may re-upload.' });
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Error confirming/denying commission:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
