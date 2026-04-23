// src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const {
    createOrder,
    createDirectOrder,
    getOrderById,
    getOrderByNumber,
    getUserOrders,
    getSellerOrders,
    updateOrderStatus,
    updatePaymentStatus,
    cancelOrder,
    getSellerStats,
    getAdminStats,
    trackOrder,
    requestRefund,
    processRefund,
    exportOrders
} = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Order creation
router.post('/', createOrder);
router.post('/direct', createDirectOrder);

// User's orders
router.get('/user', getUserOrders);
router.get('/seller', getSellerOrders);
router.get('/track/:id', trackOrder);
router.get('/number/:orderNumber', getOrderByNumber);
router.get('/:id', getOrderById);

// Order management
router.patch('/:id/status', updateOrderStatus);
router.patch('/:id/payment', updatePaymentStatus);
router.post('/:id/cancel', cancelOrder);
router.post('/:id/refund', requestRefund);

// Seller stats
router.get('/stats/seller', getSellerStats);

// Admin only routes
router.get('/admin/stats', authorize('admin'), getAdminStats);
router.post('/admin/:id/process-refund', authorize('admin'), processRefund);
router.get('/admin/export', authorize('admin'), exportOrders);

module.exports = router;