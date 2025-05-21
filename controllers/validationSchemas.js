import Joi from 'joi'; //joi is used for input validation apparently. 

export const uploadTrackSchema = Joi.object({
  title: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).allow(''),
  price: Joi.number().min(0).required(),
  // You can add more fields as needed, e.g.:
  // key: Joi.string().valid('A', 'B', 'C', 'D', 'E', 'F', 'G').optional(),
  // vocalRange: Joi.string().optional(),
});

export const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
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