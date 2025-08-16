import User from './models/User.js';
import CommissionRequest from './models/CommissionRequest.js';

// Test function to create sample commission data and test calculation
const testCommissionStats = async () => {
  try {
    console.log('=== Testing Commission Stats Calculation ===');
    
    // Find an artist user (or create one if needed)
    let artist = await User.findOne({ role: 'artist' });
    if (!artist) {
      console.log('No artist found, creating test artist...');
      artist = new User({
        username: 'test_artist_stats',
        email: 'test_artist_stats@example.com',
        password: 'hashedpassword',
        role: 'artist',
        verified: true
      });
      await artist.save();
      console.log('Created test artist:', artist.username);
    }

    // Find a customer user (or create one if needed)
    let customer = await User.findOne({ role: 'user' });
    if (!customer) {
      console.log('No customer found, creating test customer...');
      customer = new User({
        username: 'test_customer_stats',
        email: 'test_customer_stats@example.com',
        password: 'hashedpassword',
        role: 'user',
        verified: true
      });
      await customer.save();
      console.log('Created test customer:', customer.username);
    }

    console.log(`\nUsing artist: ${artist.username} (ID: ${artist._id})`);
    console.log(`Using customer: ${customer.username} (ID: ${customer._id})`);

    // Create some sample completed commissions with different completion times
    const sampleCommissions = [
      {
        customer: customer._id,
        artist: artist._id,
        requirements: 'Test commission 1',
        price: 25,
        status: 'completed',
        createdAt: new Date('2024-12-01T10:00:00Z'),
        completedAt: new Date('2024-12-08T10:00:00Z') // 7 days
      },
      {
        customer: customer._id,
        artist: artist._id,
        requirements: 'Test commission 2',
        price: 30,
        status: 'completed',
        createdAt: new Date('2024-12-10T10:00:00Z'),
        completedAt: new Date('2024-12-24T10:00:00Z') // 14 days
      },
      {
        customer: customer._id,
        artist: artist._id,
        requirements: 'Test commission 3',
        price: 35,
        status: 'completed',
        createdAt: new Date('2024-12-20T10:00:00Z'),
        completedAt: new Date('2024-12-30T10:00:00Z') // 10 days
      }
    ];

    console.log('\nCreating sample commissions...');
    
    // Delete any existing test commissions for this artist
    await CommissionRequest.deleteMany({ 
      artist: artist._id, 
      requirements: { $regex: /^Test commission/ } 
    });

    // Create the sample commissions
    for (const commissionData of sampleCommissions) {
      const commission = new CommissionRequest(commissionData);
      await commission.save();
      console.log(`Created commission: ${commission.requirements} (${commission.status})`);
    }

    // Test the calculation method
    console.log('\n=== Testing Average Commission Completion Time Calculation ===');
    console.log('Before calculation:');
    console.log(`- numOfCommissions: ${artist.numOfCommissions}`);
    console.log(`- averageCommissionCompletionTime: ${artist.averageCommissionCompletionTime}`);

    // Call the calculation method
    const averageTime = await artist.calculateAverageCommissionCompletionTime();
    
    // Reload the artist to see updated values
    await artist.reload();
    
    console.log('\nAfter calculation:');
    console.log(`- numOfCommissions: ${artist.numOfCommissions}`);
    console.log(`- averageCommissionCompletionTime: ${artist.averageCommissionCompletionTime} days`);
    console.log(`- Method returned: ${averageTime} days`);

    // Verify the calculation manually
    console.log('\n=== Manual Verification ===');
    const completedCommissions = await CommissionRequest.find({
      artist: artist._id,
      status: 'completed',
      createdAt: { $exists: true },
      completedAt: { $exists: true }
    });

    console.log(`Found ${completedCommissions.length} completed commissions:`);
    let totalDays = 0;
    
    completedCommissions.forEach((commission, index) => {
      const createdAt = new Date(commission.createdAt);
      const completedAt = new Date(commission.completedAt);
      const diffMs = completedAt - createdAt;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      totalDays += diffDays;
      
      console.log(`  ${index + 1}. ${commission.requirements}: ${diffDays} days`);
    });

    const expectedAverage = totalDays / completedCommissions.length;
    console.log(`\nExpected average: ${expectedAverage.toFixed(2)} days`);
    console.log(`Calculated average: ${artist.averageCommissionCompletionTime} days`);
    console.log(`Match: ${Math.abs(expectedAverage - artist.averageCommissionCompletionTime) < 0.01 ? 'YES' : 'NO'}`);    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
};

// Run the test
testCommissionStats();
