// utils/regexSanitizer.js
// Escapes special regex characters in a string to prevent ReDoS and regex injection

function escapeRegex(str) {
  // Only operate on strings
  if (typeof str !== 'string') return '';
  // Escape regex special characters
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Optionally, you can add a length check helper
function isSafeRegexInput(str, maxLength = 50) {
  if (typeof str !== 'string') return false;
  if (str.length === 0 || str.length > maxLength) return false;
  // Optionally, reject strings that are only special characters or whitespace
  if (!str.trim().match(/[a-zA-Z0-9]/)) return false;
  return true;
}

// File name sanitizer: removes path traversal, special chars, and normalizes
function sanitizeFileName(filename, options = {}) {
  if (typeof filename !== 'string') return '';
  // Remove path traversal and directory separators
  let sanitized = filename.replace(/[\\/]+/g, '_').replace(/\.+/g, '_');
  // Remove any non-ASCII or dangerous characters (allow alphanum, dash, underscore, dot)
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Optionally, limit length
  const maxLength = options.maxLength || 100;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }
  // Prevent empty or all-underscore names
  if (!sanitized.match(/[a-zA-Z0-9]/)) {
    sanitized = 'file_' + Date.now();
  }
  return sanitized;
}

export { escapeRegex, isSafeRegexInput, sanitizeFileName };
