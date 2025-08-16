#!/usr/bin/env node

/**
 * Test script to verify key signature formatting
 */

import { formatTrackTitleWithKey, formatKeySignature } from '../frontend/app/utils/keySignature.js';

console.log('🎵 Testing Key Signature Formatting\n');

// Test cases
const testCases = [
  {
    title: 'Over The Rainbow',
    key: 'G',
    isFlat: false,
    isSharp: false,
    isMajor: true,
    isMinor: false,
    expected: 'Over The Rainbow in G Major'
  },
  {
    title: 'You Make Me Feel Like A Natural Woman',
    key: 'A',
    isFlat: false,
    isSharp: true,
    isMajor: true,
    isMinor: false,
    expected: 'You Make Me Feel Like A Natural Woman in A♯ Major'
  },
  {
    title: 'House of the Rising Sun',
    key: 'A',
    isFlat: false,
    isSharp: false,
    isMajor: false,
    isMinor: true,
    expected: 'House of the Rising Sun in A Minor'
  },
  {
    title: 'Landslide',
    key: 'B',
    isFlat: true,
    isSharp: false,
    isMajor: true,
    isMinor: false,
    expected: 'Landslide in B♭ Major'
  },
  {
    title: 'Song Without Key',
    key: undefined,
    isFlat: false,
    isSharp: false,
    isMajor: false,
    isMinor: false,
    expected: 'Song Without Key'
  }
];

// Run tests
testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}:`);
  console.log(`  Input: "${testCase.title}"`);
  
  const keySignature = formatKeySignature(
    testCase.key, 
    testCase.isFlat, 
    testCase.isSharp, 
    testCase.isMajor, 
    testCase.isMinor
  );
  
  const formattedTitle = formatTrackTitleWithKey(
    testCase.title,
    testCase.key,
    testCase.isFlat,
    testCase.isSharp,
    testCase.isMajor,
    testCase.isMinor
  );
  
  console.log(`  Key Signature: "${keySignature}"`);
  console.log(`  Formatted Title: "${formattedTitle}"`);
  console.log(`  Expected: "${testCase.expected}"`);
  console.log(`  ✅ ${formattedTitle === testCase.expected ? 'PASS' : 'FAIL'}\n`);
});

console.log('🎉 Key signature formatting tests completed!');
