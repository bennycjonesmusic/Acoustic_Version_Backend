import emailValidator from 'node-email-verifier';

async function validateEmail(email) {
  try {
    // Basic email format validation first
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return false;
    }

    // Skip MX record check in test environment
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    // Try to validate with MX record check, but fallback if it fails
    try {
      const isValid = await emailValidator(email, { checkMx: true });
      return isValid;
    } catch (networkError) {
      console.warn('MX record check failed, falling back to format validation:', networkError.message);
      // If network/MX check fails, just use the regex validation
      // This prevents registration failures due to temporary network issues
      return true;
    }
  } catch (error) {
    console.error('Email validation error:', error.message);
    throw new Error('Email validation failed');
  }
}

export { validateEmail };