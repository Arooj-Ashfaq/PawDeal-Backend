// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const {
    register,
    login,
    refreshToken,
    logout,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    changePassword,
    getCurrentUser
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate, authValidation } = require('../middleware/validation');
const { authLimiter } = require('../middleware/rateLimiter');

// Public routes (with rate limiting)
router.post('/register', authLimiter, validate(authValidation.register), register);
router.post('/login', authLimiter, validate(authValidation.login), login);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', authLimiter, validate(authValidation.forgotPassword), forgotPassword);
router.post('/reset-password', authLimiter, validate(authValidation.resetPassword), resetPassword);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', authLimiter, resendVerification);

// Protected routes
router.post('/logout', authenticate, logout);
router.post('/change-password', authenticate, changePassword);
router.get('/me', authenticate, getCurrentUser);

module.exports = router;