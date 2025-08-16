import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import User from './models/User.js';
import CommissionRequest from './models/CommissionRequest.js';

async function testCommissionCompletionTime() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find or create a test artist
    let testArtist = await User.findOne({ email: 'test.artist@example.com' });
    
    if (!testArtist) {
      testArtist = new User({
        username: 'testartist',
        email: 'test.artist@example.com',
        password: 'testpassword123',
        role: 'artist',
        verified: true
      });
      await testArtist.save();
      console.log('Created test artist');
    } else {
      console.log('Using existing test artist');
    }

    // Create test customer
    let testCustomer = await User.findOne({ email: 'test.customer@example.com' });
    
    if (!testCustomer) {
      testCustomer = new User({
        username: 'testcustomer',
        email: 'test.customer@example.com',
        password: 'testpassword123',
        role: 'user',
        verified: true
      });
      await testCustomer.save();
      console.log('Created test customer');
    } else {
      console.log('Using existing test customer');
    }

    // Clear existing test commissions
    await CommissionRequest.deleteMany({ 
      artist: testArtist._id,
      customer: testCustomer._id 
    });
    console.log('Cleared existing test commissions');

    // Create test commissions with different completion times
    const now = new Date();
    const testCommissions = [
      {
        customer: testCustomer._id,
        artist: testArtist._id,
        requirements: 'Test commission 1',
        price: 25,
        status: 'completed',
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        completedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)   // 5 days ago (5 days to complete)
      },
      {
        customer: testCustomer._id,
        artist: testArtist._id,
        requirements: 'Test commission 2',
        price: 30,
        status: 'completed',
        createdAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
        completedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)   // 8 days ago (7 days to complete)
      },
      {
        customer: testCustomer._id,
        artist: testArtist._id,
        requirements: 'Test commission 3',
        price: 35,
        status: 'completed',
        createdAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
        completedAt: new Date(now.getTime() - 17 * 24 * 60 * 60 * 1000)  // 17 days ago (3 days to complete)
      }
    ];

    for (const commissionData of testCommissions) {
      const commission = new CommissionRequest(commissionData);
      await commission.save();
    }
    console.log('Created 3 test commissions with completion times: 5 days, 7 days, 3 days');

    // Calculate expected average: (5 + 7 + 3) / 3 = 5 days
    console.log('Expected average completion time: 5 days');

    // Test the calculation method
    console.log('\nTesting calculateAverageCommissionCompletionTime method...');
    const calculatedAverage = await testArtist.calculateAverageCommissionCompletionTime();
    
    console.log(`Calculated average completion time: ${calculatedAverage} days`);
    console.log(`Number of commissions: ${testArtist.numOfCommissions}`);

    // Verify the calculation
    if (Math.abs(calculatedAverage - 5) < 0.01) {
      console.log('✅ Test PASSED: Average calculation is correct');
    } else {
      console.log('❌ Test FAILED: Average calculation is incorrect');
    }

    // Test with no completed commissions
    console.log('\nTesting with no completed commissions...');
    
    // Create another test artist with no commissions
    let emptyArtist = await User.findOne({ email: 'empty.artist@example.com' });
    
    if (!emptyArtist) {
      emptyArtist = new User({
        username: 'emptyartist',
        email: 'empty.artist@example.com',
        password: 'testpassword123',
        role: 'artist',
        verified: true
      });
      await emptyArtist.save();
    }

    const emptyAverage = await emptyArtist.calculateAverageCommissionCompletionTime();
    console.log(`Empty artist average: ${emptyAverage} days`);
    console.log(`Empty artist commission count: ${emptyArtist.numOfCommissions}`);
    
    if (emptyAverage === 0 && emptyArtist.numOfCommissions === 0) {
      console.log('✅ Test PASSED: Empty artist calculation is correct');
    } else {
      console.log('❌ Test FAILED: Empty artist calculation is incorrect');
    }

    console.log('\n🎉 All tests completed!');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the test
testCommissionCompletionTime();
