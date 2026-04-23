// src/routes/subscriptionRoutes.js
const express = require('express');
const router = express.Router();
const {
    getPlans,
    getCurrentSubscription,
    subscribe,
    cancelSubscription,
    changePlan,
    updateAutoRenew,
    getSubscriptionHistory,
    getInvoices,
    getInvoice,
    downloadInvoice,
    getSubscriptionStats,
    getExpiringSubscriptions,
    renewSubscription,
    checkLimit,
    getPaymentMethods,
    addPaymentMethod,
    removePaymentMethod,
    setDefaultPaymentMethod,
    applyCoupon
} = require('../controllers/subscriptionController');
const { authenticate, authorize } = require('../middleware/auth');

// Public routes
router.get('/plans', getPlans);

// Protected routes (require authentication)
router.use(authenticate);

// Current subscription
router.get('/current', getCurrentSubscription);
router.get('/history', getSubscriptionHistory);
router.get('/limit/:limit_type', checkLimit);

// Subscription management
router.post('/subscribe', subscribe);
router.post('/change-plan', changePlan);
router.post('/cancel/:id', cancelSubscription);
router.patch('/:id/auto-renew', updateAutoRenew);

// Invoices
router.get('/invoices', getInvoices);
router.get('/invoices/:id', getInvoice);
router.get('/invoices/:id/download', downloadInvoice);

// Payment methods
router.get('/payment-methods', getPaymentMethods);
router.post('/payment-methods', addPaymentMethod);
router.delete('/payment-methods/:id', removePaymentMethod);
router.put('/payment-methods/:id/default', setDefaultPaymentMethod);

// Coupons
router.post('/apply-coupon', applyCoupon);

// Admin only routes
router.use(authorize('admin'));

router.get('/admin/stats', getSubscriptionStats);
router.get('/admin/expiring', getExpiringSubscriptions);
router.post('/admin/renew/:id', renewSubscription);

module.exports = router;