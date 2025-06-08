// utils/stripeAccountStatus.js
// Utility functions to check and update Stripe account status

import stripe from 'stripe';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config();

const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Check and update a user's Stripe account status fields based on current Stripe data
 * @param {string} userId - The user's MongoDB ObjectId
 * @returns {Object} Updated status information
 */
export async function updateUserStripeAccountStatus(userId) {
    try {
        const user = await User.findById(userId);
        if (!user || !user.stripeAccountId) {
            return { error: 'User not found or no Stripe account ID' };
        }

        // Fetch account details from Stripe
        const account = await stripeClient.accounts.retrieve(user.stripeAccountId);
        
        // Determine status based on Stripe account data
        let status = 'pending';
        let payoutsEnabled = false;
        let onboardingComplete = false;

        if (account.charges_enabled && account.payouts_enabled) {
            status = 'active';
            payoutsEnabled = true;
            onboardingComplete = true;
        } else if (account.requirements && account.requirements.disabled_reason) {
            status = account.requirements.disabled_reason === 'rejected.other' ? 'rejected' : 'restricted';
            payoutsEnabled = account.payouts_enabled || false;
            onboardingComplete = false;
        } else {
            status = 'pending';
            payoutsEnabled = account.payouts_enabled || false;
            onboardingComplete = false;
        }

        // Update user fields
        user.stripeAccountStatus = status;
        user.stripePayoutsEnabled = payoutsEnabled;
        user.stripeOnboardingComplete = onboardingComplete;
        await user.save();

        return {
            success: true,
            stripeAccountStatus: status,
            stripePayoutsEnabled: payoutsEnabled,
            stripeOnboardingComplete: onboardingComplete,
            accountData: {
                charges_enabled: account.charges_enabled,
                payouts_enabled: account.payouts_enabled,
                requirements: account.requirements
            }
        };
    } catch (error) {
        console.error('Error updating Stripe account status:', error);
        return { error: error.message };
    }
}

/**
 * Bulk update all users with Stripe accounts
 * @returns {Array} Results for each user updated
 */
export async function bulkUpdateStripeAccountStatuses() {
    try {
        const usersWithStripeAccounts = await User.find({ 
            stripeAccountId: { $exists: true, $ne: null } 
        });

        const results = [];
        for (const user of usersWithStripeAccounts) {
            const result = await updateUserStripeAccountStatus(user._id);
            results.push({
                userId: user._id,
                email: user.email,
                ...result
            });
        }

        return results;
    } catch (error) {
        console.error('Error in bulk Stripe account status update:', error);
        return { error: error.message };
    }
}

/**
 * Check if a user can receive payouts
 * @param {Object} user - User document
 * @returns {Object} Validation result
 */
export function validateUserForPayouts(user) {
    if (!user.stripeAccountId) {
        return { 
            valid: false, 
            reason: 'No Stripe account set up' 
        };
    }

    if (!user.stripePayoutsEnabled) {
        return { 
            valid: false, 
            reason: 'Stripe account is not enabled for payouts' 
        };
    }

    if (user.stripeAccountStatus !== 'active') {
        return { 
            valid: false, 
            reason: `Stripe account status is ${user.stripeAccountStatus}` 
        };
    }

    if (user.role !== 'artist' && user.role !== 'admin') {
        return { 
            valid: false, 
            reason: 'User role not eligible for payouts' 
        };
    }

    return { valid: true };
}
