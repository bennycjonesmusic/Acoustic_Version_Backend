import emailValidator from 'node-email-verifier';

async function validateEmail(email) {
  try {
    // Validate the email format and check MX records
    const isValid = await emailValidator(email, { checkMx: true });

    return isValid;
  } catch (error) {
    throw new Error('Email validation failed');
  }
}

export { validateEmail };