import axios from 'axios';

async function testConnection() {
  try {
    console.log('Testing server connection...');
    const response = await axios.get('http://localhost:3000/health');
    console.log('Server response:', response.status);
  } catch (error) {
    console.log('Error:', error.message);
    console.log('Server seems to be down or health endpoint missing');
    
    // Try login instead
    try {
      console.log('Testing login endpoint...');
      const loginResponse = await axios.post('http://localhost:3000/auth/login', {
        login: 'sarahandbenduo@gmail.com',
        password: 'Moobslikejabba123456'
      });
      console.log('Login successful, server is running!');
      return loginResponse.data.token;
    } catch (loginError) {
      console.log('Login error:', loginError.response?.data || loginError.message);
    }
  }
}

testConnection().then((token) => {
  if (token) {
    console.log('Got token:', token.substring(0, 20) + '...');
  }
}).catch(console.error);
