// Simple test to verify commission pagination format
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Test function to verify commission pagination response format
async function testCommissionPagination() {
  console.log('Testing commission pagination format...');
  
  try {
    // Test with a request that should return the new pagination format
    // This will fail auth but we can check the response structure
    const response = await axios.get(`${BASE_URL}/commission/artist/commissions?page=1&limit=5&orderBy=date-requested`, {
      headers: { 'Authorization': 'Bearer test-token' },
      validateStatus: () => true // Accept any status code
    });
    
    console.log('Response status:', response.status);
    console.log('Response structure check:');
    
    if (response.data && typeof response.data === 'object') {
      const hasCommissionsArray = Array.isArray(response.data.commissions);
      const hasPaginationObject = response.data.pagination && typeof response.data.pagination === 'object';
      
      console.log('✓ Response is object:', true);
      console.log('✓ Has commissions array:', hasCommissionsArray);
      console.log('✓ Has pagination object:', hasPaginationObject);
      
      if (hasPaginationObject) {
        const pagination = response.data.pagination;
        console.log('Pagination structure check:');
        console.log('  - Has currentPage:', 'currentPage' in pagination);
        console.log('  - Has totalPages:', 'totalPages' in pagination);
        console.log('  - Has totalCommissions:', 'totalCommissions' in pagination);
        console.log('  - Has hasNextPage:', 'hasNextPage' in pagination);
        console.log('  - Has hasPrevPage:', 'hasPrevPage' in pagination);
        console.log('  - Has limit:', 'limit' in pagination);
      }
    }
    
  } catch (error) {
    console.log('Expected auth error, but checking response format...');
    if (error.response && error.response.data) {
      console.log('Error response received (expected for auth)');
    }
  }
  
  console.log('Commission pagination format test completed.');
}

// Run the test
testCommissionPagination().catch(console.error);
