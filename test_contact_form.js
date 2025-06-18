// Simple test script for contact form API
// Run with: node test_contact_form.js

const API_BASE_URL = 'http://localhost:3000';

async function testContactForm() {
  console.log('Testing Contact Form API...\n');

  // Test 1: Submit a contact form
  try {
    console.log('1. Testing contact form submission...');
    const response = await fetch(`${API_BASE_URL}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        description: 'This is a test message for the contact form functionality.',
        type: 'general'
      })
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response:', data);
    
    if (response.ok) {
      console.log('✅ Contact form submission successful\n');
    } else {
      console.log('❌ Contact form submission failed\n');
    }
  } catch (error) {
    console.error('❌ Error testing contact form:', error.message);
  }

  // Test 2: Test validation (invalid email)
  try {
    console.log('2. Testing validation with invalid email...');
    const response = await fetch(`${API_BASE_URL}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'invalid-email',
        description: 'This should fail validation.',
        type: 'general'
      })
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response:', data);
    
    if (response.status === 400) {
      console.log('✅ Validation working correctly\n');
    } else {
      console.log('❌ Validation not working as expected\n');
    }
  } catch (error) {
    console.error('❌ Error testing validation:', error.message);
  }

  // Test 3: Test with missing required fields
  try {
    console.log('3. Testing with missing required fields...');
    const response = await fetch(`${API_BASE_URL}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com'
        // Missing description and type
      })
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response:', data);
    
    if (response.status === 400) {
      console.log('✅ Required field validation working\n');
    } else {
      console.log('❌ Required field validation not working\n');
    }
  } catch (error) {
    console.error('❌ Error testing required fields:', error.message);
  }

  console.log('Contact form API tests completed!');
}

// Run the tests
testContactForm().catch(console.error);
