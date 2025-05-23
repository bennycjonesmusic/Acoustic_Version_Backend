// utils/admins.js
// List of whitelisted admin emails

const adminEmails = [
  process.env.OWNER_EMAIL,
  'admin@example.com' // Add your test/admin email here for tests and local admin
];

export default adminEmails;
