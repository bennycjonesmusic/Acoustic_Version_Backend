#!/bin/bash

# Test Over The Rainbow upload with increased file size limit
BASE_URL="http://localhost:3000"

echo "🎵 Testing Over The Rainbow Upload with Increased File Size Limit"
echo "=================================================================="

# Login to get token
echo "🔐 Logging in as sarahandbenduo@gmail.com..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"login":"sarahandbenduo@gmail.com","password":"Moobslikejabba123456"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful"
echo "Token: ${TOKEN:0:20}..."

# Check file size
FILE_PATH="test-assets/Over The Rainbow.wav"
FILE_SIZE=$(stat -c%s "$FILE_PATH" 2>/dev/null || stat -f%z "$FILE_PATH" 2>/dev/null || echo "unknown")
echo "📊 File size: $FILE_SIZE bytes (~$((FILE_SIZE/1024/1024))MB)"

# Upload the track
echo "🚀 Uploading Over The Rainbow..."
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/tracks/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-assets/Over The Rainbow.wav" \
  -F "title=Over The Rainbow" \
  -F "originalArtist=Judy Garland" \
  -F "description=Classic acoustic guitar arrangement of Over The Rainbow from The Wizard of Oz." \
  -F "price=5.99" \
  -F "genre=Musical Theatre" \
  -F "backingTrackType=Acoustic Guitar" \
  -F "vocalRange=Soprano" \
  -F "instructions=Timeless classic with beautiful fingerpicking patterns. Perfect for auditions and performances.")

echo "📋 Upload Response:"
echo "$UPLOAD_RESPONSE" | head -c 500
echo "..."

# Check if upload was successful
if echo "$UPLOAD_RESPONSE" | grep -q '"message":"File uploaded successfully"'; then
  echo "✅ Upload successful!"
elif echo "$UPLOAD_RESPONSE" | grep -q '"message":"File uploaded, but preview failed"'; then
  echo "⚠️ Upload successful but preview generation failed"
else
  echo "❌ Upload failed"
fi

# Check server logs for ffmpeg output
echo ""
echo "📝 Check server terminal for ffmpeg processing logs"
