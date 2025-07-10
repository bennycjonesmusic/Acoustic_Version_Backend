import Joi from 'joi'; //joi is used for input validation apparently. 

const isTestEnv = process.env.NODE_ENV === 'test';

// Enhanced string validation with HTML/XSS protection
const safeStringSchema = (min = 1, max = 100) => 
  Joi.string()
    .min(min)
    .max(max)
    .pattern(/^[^<>&]*$/, 'safe characters') // Block HTML/XSS chars but allow quotes and apostrophes
    .trim();

// More permissive schema for descriptions and longer text
const safeDescriptionSchema = (min = 1, max = 500) => 
  Joi.string()
    .min(min)
    .max(max)
    .pattern(/^[^<>]*$/, 'safe characters') // Only block < and > (HTML tags), allow most punctuation
    .trim();

const safeOptionalStringSchema = (max = 500) => 
  Joi.string()
    .max(max)
    .pattern(/^[^<>&]*$/, 'safe characters')
    .allow('')
    .trim()
    .optional();

// More permissive optional schema for longer text fields
const safeOptionalDescriptionSchema = (max = 1000) => 
  Joi.string()
    .max(max)
    .pattern(/^[^<>]*$/, 'safe characters') // Only block < and > (HTML tags)
    .allow('')
    .trim()
    .optional();

export const uploadTrackSchema = Joi.object({
  title: safeStringSchema(1, 100).required(),
  description: safeDescriptionSchema(1, 500).required(),
  price: Joi.number().min(0).max(999999).required(), // Add reasonable max price
  originalArtist: safeStringSchema(1, 100).required(),
  type: Joi.string().valid('Backing Track', 'Jam Track', 'Acoustic Instrumental Version').required(),  backingTrackType: Joi.string().valid('Acoustic Guitar', 'Piano', 'Full Arrangement Track', 'Other').required(),
  genre: Joi.string().valid('Pop', 'Rock', 'Folk', 'Jazz', 'Classical', 'Musical Theatre', 'Country', 'Other').optional(),
  vocalRange: Joi.string().valid('Soprano', 'Mezzo-Soprano', 'Alto', 'Contralto', 'Countertenor', 'Tenor', 'Baritone', 'Bass').optional(),
  keySignature: safeOptionalStringSchema(10), // Key signatures are short
  instructions: safeOptionalDescriptionSchema(1000),
  youtubeGuideUrl: Joi.string().uri().max(500).allow('').optional(),
  guideTrackUrl: Joi.string().uri().max(500).allow('').optional(),
  licenseStatus: Joi.string().valid('unlicensed', 'licensed', 'not_required').default('not_required').optional(),
  licensedFrom: Joi.when('licenseStatus', {
    is: 'licensed',
    then: safeStringSchema(1, 200).required().messages({
      'string.empty': 'Licensed from must be a non-empty string when licenseStatus is "licensed".',
      'any.required': 'Licensed from must be a non-empty string when licenseStatus is "licensed".'
    }),
    otherwise: safeOptionalStringSchema(200)
  }),
  isHigher: Joi.boolean().optional(),
  isLower: Joi.boolean().optional(),
  licenseDocumentUrl: Joi.string().uri().max(500).allow('').optional(),
});

export const editTrackSchema = Joi.object({
  title: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).allow('').optional(),
  price: Joi.number().min(0).optional(),
  originalArtist: Joi.string().min(1).max(100).optional(),  backingTrackType: Joi.string().valid('Acoustic Guitar', 'Piano', 'Full Arrangement Track', 'Other').optional(),  genre: Joi.string().valid('Pop', 'Rock', 'Folk', 'Jazz', 'Classical', 'Musical Theatre', 'Country', 'Other').optional(),
  vocalRange: Joi.string().valid('Soprano', 'Mezzo-Soprano', 'Alto', 'Contralto', 'Countertenor', 'Tenor', 'Baritone', 'Bass').optional(),
  keySignature: Joi.string().allow('').optional(), // Optional key signature for editing
  instructions: Joi.string().max(1000).allow('').optional(),
  youtubeGuideUrl: Joi.string().uri().allow('').optional(),
  guideTrackUrl: Joi.string().uri().allow('').optional(),
  licenseStatus: Joi.string().valid('unlicensed', 'licensed', 'not_required').optional(),
  licensedFrom: Joi.string().allow('').optional(), // Simplified for edit: controller will handle logic if licenseStatus changes to 'licensed'
  isHigher: Joi.boolean().optional(),
  isLower: Joi.boolean().optional(),
  // key: Joi.string().valid('A', 'B', 'C', 'D', 'E', 'F', 'G').optional(), // Assuming key is not editable or handled elsewhere
});

export const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  about: Joi.string().min(1).max(500).optional(),
  role: isTestEnv
    ? Joi.string().valid('user', 'artist', 'admin').optional()
    : Joi.string().valid('user', 'artist').optional(),
  commissionPrice: Joi.when('role', {
    is: 'artist',
    then: Joi.number().min(0).max(10000).required(),
    otherwise: Joi.forbidden(),
  }),
});

export const loginSchema = Joi.object({
  login: Joi.string().required(), // can be email or username
  password: Joi.string().required(),
});

export const reviewSchema = Joi.object({

    rating: Joi.number().min(1).max(5).required(),




});

export const commentSchema = Joi.object({
  comment: Joi.string().min(1).max(250).required(),
});

export const artistAboutSchema = Joi.object({
  about: Joi.string().min(1).max(500).required(),
});

export const artistInstrumentSchema = Joi.object({
  artistInstrument: Joi.string().min(1).max(100).required().messages({
    'string.empty': 'Artist instrument cannot be empty.',
    'string.min': 'Artist instrument must be at least 1 character long.',
    'string.max': 'Artist instrument cannot exceed 100 characters.',
    'any.required': 'Artist instrument is required.'
  }),
});

export const contactForumSchema = Joi.object({
  email: Joi.string().email().optional().messages({
    'string.email': 'Please provide a valid email address.'
  }),
  description: Joi.string().min(10).max(1000).required().messages({
    'string.min': 'Description must be at least 10 characters long.',
    'string.max': 'Description cannot exceed 1000 characters.',
    'any.required': 'Description is required.'
  }),
  type: Joi.string().valid(
    'general',
    'bug_report',
    'feature_request',
    'user_report',
    'other',
    'commission_dispute',
    'copyright_complaint'
  ).required().messages({
    'any.only': 'Type must be one of: general, bug_report, feature_request, user_report, other, commission_dispute, copyright_complaint.',
    'any.required': 'Contact type is required.'
  }),
  commissionId: Joi.string().optional() // Allow optional commissionId for dispute/contact linkage
});

// Guide track upload validation schema
export const guideTrackUploadSchema = Joi.object({
  // No additional fields needed - file validation is handled in controller
  // This schema is for future extensibility if we need to add metadata
});