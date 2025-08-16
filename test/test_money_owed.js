import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

dotenv.config();

async function testMoneyOwedSystem() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find users with money owed
    const usersWithMoneyOwed = await User.find({
      'moneyOwed.0': { $exists: true }
    }).select('email moneyOwed stripeAccountId stripePayoutsEnabled');

    console.log(`\n📊 MONEY OWED REPORT`);
    console.log(`Found ${usersWithMoneyOwed.length} users with money owed:\n`);

    let totalOwed = 0;
    
    for (const user of usersWithMoneyOwed) {
      const userTotalOwed = user.moneyOwed.reduce((sum, owed) => sum + owed.amount, 0);
      totalOwed += userTotalOwed;
      
      console.log(`👤 ${user.email}`);
      console.log(`   💰 Total owed: £${userTotalOwed.toFixed(2)}`);
      console.log(`   🏦 Stripe setup: ${user.stripeAccountId ? '✅' : '❌'} Account | ${user.stripePayoutsEnabled ? '✅' : '❌'} Payouts`);
      console.log(`   📝 Pending payments:`);
      
      for (const owed of user.moneyOwed) {
        console.log(`      - £${owed.amount.toFixed(2)} | ${owed.reference} | ${owed.source}`);
      }
      console.log('');
    }

    console.log(`💰 TOTAL MONEY OWED ACROSS ALL USERS: £${totalOwed.toFixed(2)}`);
    
    // Summary by readiness to pay
    const readyToPay = usersWithMoneyOwed.filter(u => u.stripeAccountId && u.stripePayoutsEnabled);
    const notReady = usersWithMoneyOwed.filter(u => !u.stripeAccountId || !u.stripePayoutsEnabled);
    
    const readyAmount = readyToPay.reduce((sum, user) => 
      sum + user.moneyOwed.reduce((userSum, owed) => userSum + owed.amount, 0), 0);
    
    const notReadyAmount = notReady.reduce((sum, user) => 
      sum + user.moneyOwed.reduce((userSum, owed) => userSum + owed.amount, 0), 0);

    console.log(`\n📈 PAYOUT READINESS:`);
    console.log(`✅ Ready to pay: ${readyToPay.length} users, £${readyAmount.toFixed(2)}`);
    console.log(`❌ Not ready: ${notReady.length} users, £${notReadyAmount.toFixed(2)}`);
    
    if (notReady.length > 0) {
      console.log(`\n⚠️  Users not ready for payout:`);
      for (const user of notReady) {
        const issues = [];
        if (!user.stripeAccountId) issues.push('No Stripe account');
        if (!user.stripePayoutsEnabled) issues.push('Payouts disabled');
        console.log(`   ${user.email}: ${issues.join(', ')}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

testMoneyOwedSystem();
