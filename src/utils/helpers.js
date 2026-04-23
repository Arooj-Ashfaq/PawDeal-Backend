const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

// Generate UUID
const generateUUID = () => uuidv4();

// Hash password
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

// Generate JWT token
const generateToken = (userId, expiresIn = process.env.JWT_EXPIRY) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn }
    );
};

// Generate refresh token
const generateRefreshToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRY }
    );
};

// Generate order number
const generateOrderNumber = () => {
    const date = moment().format('YYYYMMDD');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${date}-${random}`;
};

// Generate slug from string
const generateSlug = (text) => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')        // Replace spaces with -
        .replace(/[^\w\-]+/g, '')     // Remove all non-word chars
        .replace(/\-\-+/g, '-')       // Replace multiple - with single -
        .replace(/^-+/, '')            // Trim - from start of text
        .replace(/-+$/, '');           // Trim - from end of text
};

// Format price
const formatPrice = (price, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(price);
};

// Calculate pagination
const getPagination = (page = 1, limit = 20) => {
    const offset = (page - 1) * limit;
    return {
        limit: parseInt(limit),
        offset: parseInt(offset),
        page: parseInt(page)
    };
};

// Format paginated response
const formatPaginatedResponse = (data, total, page, limit) => {
    return {
        data,
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit)
        }
    };
};

// Get public user data (remove sensitive info)
const getPublicUserData = (user) => {
    const { password_hash, refresh_token, email_verification_token, reset_password_token, ...publicData } = user;
    return publicData;
};

// Validate email format
const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

// Validate phone number
const isValidPhone = (phone) => {
    const re = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/;
    return re.test(phone);
};

// Generate random password
const generateRandomPassword = (length = 10) => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
};

// Calculate average rating
const calculateAverageRating = (reviews) => {
    if (!reviews || reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / reviews.length).toFixed(1);
};

// Group by key
const groupBy = (array, key) => {
    return array.reduce((result, currentValue) => {
        (result[currentValue[key]] = result[currentValue[key]] || []).push(currentValue);
        return result;
    }, {});
};

module.exports = {
    generateUUID,
    hashPassword,
    comparePassword,
    generateToken,
    generateRefreshToken,
    generateOrderNumber,
    generateSlug,
    formatPrice,
    getPagination,
    formatPaginatedResponse,
    getPublicUserData,
    isValidEmail,
    isValidPhone,
    generateRandomPassword,
    calculateAverageRating,
    groupBy
};