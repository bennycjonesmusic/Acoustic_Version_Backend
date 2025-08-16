# Fast Payout Testing Guide

This system now supports **fast payouts for cart purchases** to make testing much easier!

## 🚀 How It Works

### Development Mode (Fast Testing)
- **Cart purchases**: Payouts triggered automatically in **30 seconds**
- **Single track purchases**: Still use instant Stripe splits (unchanged)
- **Cron job**: Runs every 2 minutes as backup

### Production Mode (Safe & Reliable)
- **Cart purchases**: Processed by hourly cron job
- **Single track purchases**: Still use instant Stripe splits (unchanged)
- **Cron job**: Runs every hour

## ⚡ Testing Cart Purchases

1. **Start server in development mode:**
   ```bash
   npm start
   # Make sure NODE_ENV is NOT set to "production"
   ```

2. **Make a cart purchase:**
   - Add multiple tracks to cart
   - Complete checkout
   - Watch for `[FAST PAYOUT]` logs in server console

3. **Automatic payout sequence:**
   ```
   [WEBHOOK] Cart purchase detected - triggering fast payout for testing
   [FAST PAYOUT] Scheduling payout in 30 seconds after cart purchase...
   [FAST PAYOUT] Processing triggered payout...
   [PAYOUT] Processing 2 pending payouts for 1 artists...
   [FAST PAYOUT] Triggered payout completed
   ```

4. **Check status:**
   ```bash
   node test_fast_payout_demo.js
   ```

## 🛠️ Manual Testing Options

### Trigger Payouts Immediately
```bash
curl -X POST http://localhost:3001/stripe/trigger-payouts
```

### Check Current Status
```bash
node test_money_owed.js
```

### View Fast Payout Demo
```bash
node test_fast_payout_demo.js
```

## 🏭 Production Safety

- Fast payouts are **automatically disabled** in production
- Only the reliable hourly cron job runs in production
- No risk of overwhelming Stripe API with frequent calls
- Same robust error handling and balance checking

## 🔍 Key Log Messages

### Development Mode
- `[FAST PAYOUT] Cart purchase detected` - Fast payout triggered
- `[FAST PAYOUT] Scheduling payout in 30 seconds` - Timer started
- `[FAST PAYOUT] Processing triggered payout` - Payout executing

### Production Mode
- `[PAYOUT] Cart purchase completed - payouts will be processed by hourly cron job`

## 📊 Testing Scenarios

1. **Single track purchase** → Instant payout via Stripe split
2. **Cart with multiple tracks** → 30-second delayed payout (dev) / hourly (prod)
3. **Mixed artists in cart** → All artists paid correctly
4. **Insufficient Stripe balance** → Payments queued for retry
5. **Failed payments** → Remain in queue, detailed logging

This makes testing cart purchases much faster while keeping production safe and reliable!
