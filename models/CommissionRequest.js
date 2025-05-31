import mongoose from 'mongoose';

const commissionRequestSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  artist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requirements: { type: String, required: true },
  price: { type: Number, required: false }, // Now optional, will be set from artist if not provided
  status: {
    type: String,
    enum: ['pending_artist', 'requested', 'accepted', 'in_progress', 'delivered', 'approved', 'paid', 'cancelled', 'rejected_by_artist', 'cron_pending'],
    default: 'pending_artist',
  },
  stripeSessionId: { type: String },
  stripePaymentIntentId: { type: String },
  stripeTransferId: { type: String }, // <-- Add this line
  finishedTrackUrl: { type: String },
  previewTrackUrl: { type: String },
  guideTrackUrl: { type: String }, //optional guide track url
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: false }, // Optional deadline for delivery
  cancellationReason: { type: String }, // Reason for cancellation, if cancelled
});

commissionRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const CommissionRequest = mongoose.model('CommissionRequest', commissionRequestSchema);
export default CommissionRequest;
