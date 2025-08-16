#!/usr/bin/env node

/**
 * Test script to verify that the artist example upload endpoint
 * properly handles errors and returns JSON responses instead of binary data.
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

// Test various scenarios that could cause the hexadecimal response bug
async function testUploadErrorHandling() {
    console.log('🧪 Testing upload error handling to prevent binary responses...\n');
    
    try {
        // Test 1: Upload without authentication
        console.log('Test 1: Upload without authentication token');
        try {
            const formData = new FormData();
            formData.append('file', Buffer.from('fake audio data'), 'test.mp3');
            
            const response = await axios.post(`${BASE_URL}/users/artist/examples/upload`, formData, {
                headers: { ...formData.getHeaders() }
            });
            console.log('❌ Expected auth error but got success:', response.status);
        } catch (error) {
            if (error.response && error.response.data && typeof error.response.data === 'object') {
                console.log('✅ Proper JSON error response:', error.response.data);
            } else {
                console.log('❌ Non-JSON response:', typeof error.response?.data, error.response?.data?.slice?.(0, 100));
            }
        }
        
        // Test 2: Upload with invalid file type
        console.log('\nTest 2: Upload with invalid file type');
        try {
            const formData = new FormData();
            formData.append('file', Buffer.from('not an audio file'), 'test.txt');
            
            const response = await axios.post(`${BASE_URL}/users/artist/examples/upload`, formData, {
                headers: { 
                    ...formData.getHeaders(),
                    'Authorization': 'Bearer invalid_token'
                }
            });
            console.log('❌ Expected file type error but got success:', response.status);
        } catch (error) {
            if (error.response && error.response.data && typeof error.response.data === 'object') {
                console.log('✅ Proper JSON error response:', error.response.data);
            } else {
                console.log('❌ Non-JSON response:', typeof error.response?.data, error.response?.data?.slice?.(0, 100));
            }
        }
        
        // Test 3: Upload with corrupted/empty file
        console.log('\nTest 3: Upload with empty file');
        try {
            const formData = new FormData();
            formData.append('file', Buffer.alloc(0), 'empty.mp3');
            
            const response = await axios.post(`${BASE_URL}/users/artist/examples/upload`, formData, {
                headers: { 
                    ...formData.getHeaders(),
                    'Authorization': 'Bearer invalid_token'
                }
            });
            console.log('❌ Expected empty file error but got success:', response.status);
        } catch (error) {
            if (error.response && error.response.data && typeof error.response.data === 'object') {
                console.log('✅ Proper JSON error response:', error.response.data);
            } else {
                console.log('❌ Non-JSON response:', typeof error.response?.data, error.response?.data?.slice?.(0, 100));
            }
        }
        
        // Test 4: Upload with very large file
        console.log('\nTest 4: Upload with oversized file');
        try {
            const formData = new FormData();
            // Create a buffer larger than the 100MB limit
            const largeBuffer = Buffer.alloc(101 * 1024 * 1024, 'a'); // 101MB
            formData.append('file', largeBuffer, 'large.mp3');
            
            const response = await axios.post(`${BASE_URL}/users/artist/examples/upload`, formData, {
                headers: { 
                    ...formData.getHeaders(),
                    'Authorization': 'Bearer invalid_token'
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });
            console.log('❌ Expected size limit error but got success:', response.status);
        } catch (error) {
            if (error.response && error.response.data && typeof error.response.data === 'object') {
                console.log('✅ Proper JSON error response:', error.response.data);
            } else {
                console.log('❌ Non-JSON response:', typeof error.response?.data, error.response?.data?.slice?.(0, 100));
            }
        }
        
        console.log('\n🎯 Test Summary:');
        console.log('All error scenarios should return proper JSON responses, not binary data.');
        console.log('If you see "❌ Non-JSON response" above, the bug still exists.');
        console.log('If you see "✅ Proper JSON error response" for all tests, the fix worked!');
        
    } catch (error) {
        console.error('Test runner error:', error.message);
    }
}

// Check if server is running
async function checkServer() {
    try {
        const response = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Server is running');
        return true;
    } catch (error) {
        console.log('❌ Server is not running. Please start the server with: npm start');
        return false;
    }
}

async function main() {
    console.log('🔧 Artist Example Upload Fix Verification\n');
    
    const serverRunning = await checkServer();
    if (!serverRunning) {
        process.exit(1);
    }
    
    await testUploadErrorHandling();
}

main().catch(console.error);
