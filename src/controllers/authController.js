// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const { generateToken, generateRefreshToken } = require('../utils/helpers');
const { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail } = require('../services/emailService');

// Register new user
const register = async (req, res) => {
    try {
        const { email, password, first_name, last_name, phone } = req.body;

        console.log('Registration attempt for email:', email);

        // Check if user already exists
        const existingUser = await UserModel.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Email already registered'
            });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Create verification token
        const verificationToken = jwt.sign(
            { email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Create user
        const userId = await UserModel.create({
            email,
            password_hash,
            first_name,
            last_name,
            phone,
            email_verification_token: verificationToken
        });

        // Send verification email (temporarily disabled)
        // await sendVerificationEmail({ email, first_name }, verificationToken);
        console.log(`Verification token for ${email}: ${verificationToken}`);

        res.status(201).json({
            success: true,
            message: 'Registration successful. You can now log in.',
            userId
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed. Please try again.'
        });
    }
};

// Login user
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('=========================================');
        console.log('Login attempt for email:', email);
        console.log('Received password length:', password ? password.length : 0);

        // Find user
        const user = await UserModel.findByEmail(email);
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            console.log('User not found in database');
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        console.log('User account_status:', user.account_status);
        console.log('User email_verified:', user.email_verified);

        // Check if account is active
        if (user.account_status !== 'active') {
            console.log('Account status is not active:', user.account_status);
            return res.status(403).json({
                success: false,
                error: 'Account is not active. Please verify your email or contact support.'
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        console.log('Password valid:', validPassword);
        
        if (!validPassword) {
            console.log('Password verification failed');
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        console.log('Login successful for:', email);

        // Update last login
        await UserModel.updateLastLogin(user.id);

        // Generate tokens
        const accessToken = generateToken(user.id);
        const refreshToken = generateRefreshToken(user.id);

        // Remove sensitive data
        delete user.password_hash;
        delete user.refresh_token;
        delete user.email_verification_token;
        delete user.reset_password_token;
        delete user.reset_password_expires;

        res.json({
            success: true,
            message: 'Login successful',
            token: accessToken,
            refreshToken,
            user
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed. Please try again.'
        });
    }
};

// Refresh token
const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token required'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

        // Get user
        const user = await UserModel.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        // Generate new access token
        const accessToken = generateToken(user.id);

        res.json({
            success: true,
            token: accessToken
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Refresh token expired'
            });
        }
        res.status(401).json({
            success: false,
            error: 'Invalid refresh token'
        });
    }
};

// Logout
const logout = async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
};

// Verify email
const verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        const verified = await UserModel.verifyEmail(token);

        if (verified) {
            const user = await UserModel.findByEmail(req.query.email);
            if (user) {
                await sendWelcomeEmail(user);
            }

            res.json({
                success: true,
                message: 'Email verified successfully. You can now log in.'
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Invalid or expired verification token'
            });
        }
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Email verification failed'
        });
    }
};

// Resend verification email
const resendVerification = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await UserModel.findByEmail(email);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (user.email_verified) {
            return res.status(400).json({
                success: false,
                error: 'Email already verified'
            });
        }

        const verificationToken = jwt.sign(
            { email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        await UserModel.query(
            'UPDATE users SET email_verification_token = ? WHERE id = ?',
            [verificationToken, user.id]
        );

        await sendVerificationEmail(user, verificationToken);

        res.json({
            success: true,
            message: 'Verification email sent'
        });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send verification email'
        });
    }
};

// Forgot password
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await UserModel.findByEmail(email);
        if (!user) {
            return res.json({
                success: true,
                message: 'If your email is registered, you will receive a password reset link'
            });
        }

        const resetToken = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const expires = new Date(Date.now() + 3600000);
        await UserModel.setResetToken(email, resetToken, expires);

        await sendPasswordResetEmail(user, resetToken);

        res.json({
            success: true,
            message: 'If your email is registered, you will receive a password reset link'
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process request'
        });
    }
};

// Reset password
const resetPassword = async (req, res) => {
    try {
        const { token, new_password } = req.body;

        const hashedPassword = await bcrypt.hash(new_password, 10);

        const reset = await UserModel.resetPassword(token, hashedPassword);

        if (reset) {
            res.json({
                success: true,
                message: 'Password reset successful. You can now log in with your new password.'
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Invalid or expired reset token'
            });
        }
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset password'
        });
    }
};

// Change password (authenticated)
const changePassword = async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        const userId = req.user.id;

        const user = await UserModel.findByEmail(req.user.email);

        const validPassword = await bcrypt.compare(current_password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Current password is incorrect'
            });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);

        await UserModel.updatePassword(userId, hashedPassword);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to change password'
        });
    }
};

// Get current user
const getCurrentUser = async (req, res) => {
    try {
        const user = await UserModel.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const isSeller = await UserModel.isSeller(user.id);
        user.is_seller = isSeller;

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user information'
        });
    }
};

// Google OAuth callback
const googleCallback = async (req, res) => {
    try {
        res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${req.user.token}`);
    } catch (error) {
        console.error('Google OAuth error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
    }
};

// Facebook OAuth callback
const facebookCallback = async (req, res) => {
    try {
        res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${req.user.token}`);
    } catch (error) {
        console.error('Facebook OAuth error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
    }
};

module.exports = {
    register,
    login,
    refreshToken,
    logout,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    changePassword,
    getCurrentUser,
    googleCallback,
    facebookCallback
};