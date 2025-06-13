import Joi from 'joi'; //joi is used for input validation apparently. 

const isTestEnv = process.env.NODE_ENV === 'test';

export const uploadTrackSchema = Joi.object({
  title: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).required(),
  price: Joi.number().min(0).required(),
  originalArtist: Joi.string().min(1).max(100).required(),  backingTrackType: Joi.string().valid('Acoustic Guitar', 'Piano', 'Full Arrangement Track', 'Other').required(),
  genre: Joi.string().valid('Pop', 'Rock', 'Folk', 'Jazz', 'Classical', 'Musical Theatre', 'Country', 'Other').optional(),
  vocalRange: Joi.string().valid('Soprano', 'Mezzo-Soprano', 'Contralto', 'Countertenor', 'Tenor', 'Baritone', 'Bass').optional(),
  instructions: Joi.string().max(1000).allow('').optional(),
  youtubeGuideUrl: Joi.string().uri().allow('').optional(),
  guideTrackUrl: Joi.string().uri().allow('').optional(),
  licenseStatus: Joi.string().valid('unlicensed', 'licensed', 'not_required').default('not_required').optional(),
  licensedFrom: Joi.when('licenseStatus', {
    is: 'licensed',
    then: Joi.string().trim().min(1).required().messages({
      'string.empty': 'Licensed from must be a non-empty string when licenseStatus is "licensed".',
      'any.required': 'Licensed from must be a non-empty string when licenseStatus is "licensed".'
    }),
    otherwise: Joi.string().allow('').optional()
  }),
  

  // key: Joi.string().valid('A', 'B', 'C', 'D', 'E', 'F', 'G').optional(),
});

export const editTrackSchema = Joi.object({
  title: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional(),
  price: Joi.number().min(0).optional(),
  originalArtist: Joi.string().min(1).max(100).optional(),  backingTrackType: Joi.string().valid('Acoustic Guitar', 'Piano', 'Full Arrangement Track', 'Other').optional(),
  genre: Joi.string().valid('Pop', 'Rock', 'Folk', 'Jazz', 'Classical', 'Musical Theatre', 'Country', 'Other').optional(),
  vocalRange: Joi.string().valid('Soprano', 'Mezzo-Soprano', 'Contralto', 'Countertenor', 'Tenor', 'Baritone', 'Bass').optional(),
  instructions: Joi.string().max(1000).allow('').optional(),
  youtubeGuideUrl: Joi.string().uri().allow('').optional(),
  guideTrackUrl: Joi.string().uri().allow('').optional(),
  licenseStatus: Joi.string().valid('unlicensed', 'licensed', 'not_required').optional(),
  licensedFrom: Joi.string().allow('').optional(), // Simplified for edit: controller will handle logic if licenseStatus changes to 'licensed'
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

export const contactForumSchema = Joi.object({
  email: Joi.string().email().required(),
  description: Joi.string().min(1).max(1000).required(),
  type: Joi.string().valid('general', 'bug_report', 'feature_request', 'user_report', 'other').required(),


});

// Guide track upload validation schema
export const guideTrackUploadSchema = Joi.object({
  // No additional fields needed - file validation is handled in controller
  // This schema is for future extensibility if we need to add metadata
});