import mongoose from 'mongoose';

const commissionRequestSchema = new mongoose.Schema({
  name: { type: String },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  artist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requirements: { type: String, required: true },
  price: { type: Number, required: false }, // Now optional, will be set from artist if not provided
  status: {
    type: String,
    enum: ['pending_artist', 'requested', 'accepted', 'in_progress', 'delivered', 'approved', 'paid', 'cancelled', 'rejected_by_artist', 'cron_pending', 'completed'],
    default: 'pending_artist',
  },
  stripeSessionId: { type: String },
  stripePaymentIntentId: { type: String },
  stripeTransferId: { type: String }, // <-- Add this line
  finishedTrackUrl: { type: String },
  previewTrackUrl: { type: String },
  guideTrackUrl: { type: String }, //optional guide track url
  revisionCount: { type: Number, default: 0 }, // Track number of revisions requested
  maxRevisions: { type: Number, default: 2 }, // Maximum allowed revisions
  revisionFeedback: { type: String }, // Customer's feedback for requested changes
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date }, // When the commission was marked as completed
  expiryDate: { type: Date, required: false }, // Optional deadline for delivery
  cancellationReason: { type: String }, // Reason for cancellation, if cancelled
});

commissionRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Set completedAt timestamp when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  next();
});

// Post-save hook to update artist's average commission completion time
commissionRequestSchema.post('save', async function(doc) {
  // Only trigger when status is changed to completed
  if (doc.status === 'completed' && doc.completedAt) {
    try {
      const User = mongoose.model('User');
      const artist = await User.findById(doc.artist);
      if (artist && typeof artist.calculateAverageCommissionCompletionTime === 'function') {
        await artist.calculateAverageCommissionCompletionTime();
      }
    } catch (error) {
      console.error('Error updating artist average commission completion time:', error);
      // Don't throw the error to avoid disrupting the commission save operation
    }
  }
});

commissionRequestSchema.index({ customer: 1 }); // Fast lookup of commissions by customer
commissionRequestSchema.index({ artist: 1 });   // Fast lookup of commissions by artist

const CommissionRequest = mongoose.model('CommissionRequest', commissionRequestSchema);
export default CommissionRequest;
