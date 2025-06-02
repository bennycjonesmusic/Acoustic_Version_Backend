import mongoose from "mongoose";

const contactForumSchema = new mongoose.Schema({

    email: {

        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    type: {

        type: String,
        enum: ['general', 'bug_report', 'feature_request', 'user_report', 'other']
    },
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Optional, can be null if not logged in
    },
    status: {
        type: String,
        enum: ['open', 'in_progress', 'resolved', 'closed'],
        default: 'open'
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },






});

export default mongoose.model('ContactForum', contactForumSchema);
// This schema defines a contact forum model for users to report issues, request features, or provide feedback.