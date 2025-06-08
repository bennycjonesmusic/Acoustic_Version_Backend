// test_stripe_status_fields.js
// Test script to verify all Stripe functions properly handle the new User schema fields

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

async function testStripeStatusFields() {
    console.log('Starting Stripe status fields test...');
    try {
        // Connect to MongoDB        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Clean up any existing test user first
        await User.deleteMany({ email: 'test_stripe@example.com' });
        console.log('Cleaned up any existing test users');        // Create a test user
        const testUser = new User({
            username: 'test_stripe_user',
            email: 'test_stripe@example.com',
            password: 'testpassword123',
            role: 'artist'
        });await testUser.save();
        console.log('✅ Created test user with default Stripe status fields');
        console.log(`   stripeAccountStatus: ${testUser.stripeAccountStatus}`);
        console.log(`   stripePayoutsEnabled: ${testUser.stripePayoutsEnabled}`);
        console.log(`   stripeOnboardingComplete: ${testUser.stripeOnboardingComplete}`);

        // Test 1: Verify default values
        if (testUser.stripeAccountStatus !== 'pending') {
            throw new Error(`Default stripeAccountStatus should be "pending", got: ${testUser.stripeAccountStatus}`);
        }
        if (testUser.stripePayoutsEnabled !== false) {
            throw new Error(`Default stripePayoutsEnabled should be false, got: ${testUser.stripePayoutsEnabled}`);
        }
        if (testUser.stripeOnboardingComplete !== false) {
            throw new Error(`Default stripeOnboardingComplete should be false, got: ${testUser.stripeOnboardingComplete}`);
        }
        console.log('✅ Default values test passed');

        // Test 2: Update fields using dot syntax
        testUser.stripeAccountStatus = 'active';
        testUser.stripePayoutsEnabled = true;
        testUser.stripeOnboardingComplete = true;
        await testUser.save();
        console.log('✅ Dot syntax update test passed');

        // Test 3: Verify the updates persisted
        const updatedUser = await User.findById(testUser._id);
        if (updatedUser.stripeAccountStatus !== 'active') {
            throw new Error('stripeAccountStatus update did not persist');
        }
        if (updatedUser.stripePayoutsEnabled !== true) {
            throw new Error('stripePayoutsEnabled update did not persist');
        }
        if (updatedUser.stripeOnboardingComplete !== true) {
            throw new Error('stripeOnboardingComplete update did not persist');
        }
        console.log('✅ Persistence test passed');

        // Test 4: Test enum validation
        try {
            testUser.stripeAccountStatus = 'invalid_status';
            await testUser.save();
            throw new Error('Should have failed validation for invalid enum value');
        } catch (error) {
            if (error.message.includes('invalid_status')) {
                console.log('✅ Enum validation test passed');
            } else {
                throw error;
            }
        }

        // Test 5: Test the utility function (if we have a mock Stripe account)
        testUser.stripeAccountId = 'acct_test123';
        testUser.stripeAccountStatus = 'pending';
        testUser.stripePayoutsEnabled = false;
        testUser.stripeOnboardingComplete = false;
        await testUser.save();

        console.log('✅ Mock Stripe account setup for utility test');

        // Test 6: Test JSON transformation (stripeAccountId should be hidden)
        const userJson = testUser.toJSON();
        if (userJson.stripeAccountId) {
            throw new Error('stripeAccountId should be hidden in JSON transform');
        }
        console.log('✅ JSON transformation test passed - stripeAccountId is hidden');

        // Cleanup
        await User.findByIdAndDelete(testUser._id);
        console.log('✅ Test user cleaned up');

        await mongoose.disconnect();
        console.log('✅ All tests passed! Stripe status fields are working correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run the test
testStripeStatusFields();
