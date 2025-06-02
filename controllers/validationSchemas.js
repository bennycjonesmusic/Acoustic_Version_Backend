import Joi from 'joi'; //joi is used for input validation apparently. 

const isTestEnv = process.env.NODE_ENV === 'test';

export const uploadTrackSchema = Joi.object({
  title: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).required(),
  price: Joi.number().min(0).required(),
  originalArtist: Joi.string().min(1).max(100).required(),
  backingTrackType: Joi.string().valid('Acoustic Guitar', 'Piano', 'Full Arrangement Track', 'Other').required(),
  genre: Joi.string().valid('Pop', 'Rock', 'Folk', 'Jazz', 'Classical', 'Musical Theatre', 'Country', 'Other').optional(),
  vocalRange: Joi.string().valid('Soprano', 'Mezzo-Soprano', 'Contralto', 'Countertenor', 'Tenor', 'Baritone', 'Bass').optional(),
  instructions: Joi.string().max(1000).allow('').optional(),
  youtubeGuideUrl: Joi.string().uri().allow('').optional(),
  guideTrackUrl: Joi.string().uri().allow('').optional(),

  // key: Joi.string().valid('A', 'B', 'C', 'D', 'E', 'F', 'G').optional(),
});

export const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  about: Joi.string().min(1).max(500).required(),
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