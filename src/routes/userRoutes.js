// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const {
    getProfile,
    updateProfile,
    uploadProfileImage,
    becomeSeller,
    getUserListings,
    getUserOrders,
    getUserSales,
    getUserFavorites,
    addFavorite,
    removeFavorite,
    checkFavorite,
    getUserNotifications,
    updateNotificationPrefs,
    getSellerDashboard,
    getBuyerDashboard,
    deleteAccount,
    exportUserData
} = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { validate, userValidation } = require('../middleware/validation');

// Public profile (no auth required)
router.get('/:id', getProfile);

// All routes below require authentication
router.use(authenticate);

// Profile management
router.get('/profile/me', getProfile);
router.put('/profile', validate(userValidation.updateProfile), updateProfile);
router.post('/profile/image', uploadProfileImage);

// Seller application
router.post('/become-seller', becomeSeller);

// User listings
router.get('/:id/listings', getUserListings);

// Orders and sales
router.get('/orders/buyer', getUserOrders);
router.get('/orders/seller', getUserSales);

// Favorites
router.get('/favorites', getUserFavorites);
router.post('/favorites/:type/:id', addFavorite);
router.delete('/favorites/:type/:id', removeFavorite);
router.get('/favorites/check/:type/:id', checkFavorite);

// Notifications
router.get('/notifications', getUserNotifications);
router.put('/notifications/preferences', updateNotificationPrefs);

// Dashboards
router.get('/dashboard/buyer', getBuyerDashboard);
router.get('/dashboard/seller', getSellerDashboard);

// Account management
router.delete('/account', deleteAccount);
router.get('/export/data', exportUserData);

module.exports = router;