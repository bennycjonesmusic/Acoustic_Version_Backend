import mongoose from 'mongoose';

const commissionRequestSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  artist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requirements: { type: String, required: true },
  price: { type: Number, required: true },
  status: {
    type: String,
    enum: ['requested', 'accepted', 'in_progress', 'delivered', 'approved', 'paid', 'cancelled'],
    default: 'requested',
  },
  stripeSessionId: { type: String },
  stripePaymentIntentId: { type: String },
  finishedTrackUrl: { type: String },
  previewTrackUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: false }, // Optional deadline for delivery
});

commissionRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const CommissionRequest = mongoose.model('CommissionRequest', commissionRequestSchema);
export default CommissionRequest;
