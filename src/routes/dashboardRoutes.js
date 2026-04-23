// src/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const {
    getBuyerDashboard,
    getSellerDashboard,
    getAdminDashboard,
    getAnalytics,
    getEarningsReport,
    getRealtimeStats,
    exportDashboardData,
    getNotificationSettings,
    updateNotificationSettings
} = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Buyer dashboard
router.get('/buyer', getBuyerDashboard);

// Seller dashboard
router.get('/seller', getSellerDashboard);
router.get('/analytics', getAnalytics);
router.get('/earnings', getEarningsReport);
router.get('/realtime', getRealtimeStats);
router.get('/export', exportDashboardData);

// Notification settings
router.get('/notifications', getNotificationSettings);
router.put('/notifications', updateNotificationSettings);

// Admin dashboard
router.get('/admin', authorize('admin'), getAdminDashboard);

module.exports = router;