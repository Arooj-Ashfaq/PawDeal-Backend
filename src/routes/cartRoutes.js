// src/routes/cartRoutes.js
const express = require('express');
const router = express.Router();
const {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    getCartCount,
    validateCart,
    getCheckoutSummary,
    mergeCarts
} = require('../controllers/cartController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Cart management
router.get('/', getCart);
router.get('/count', getCartCount);
router.get('/validate', validateCart);
router.get('/checkout', getCheckoutSummary);
router.post('/items', addToCart);
router.put('/items/:itemId', updateCartItem);
router.delete('/items/:itemId', removeFromCart);
router.delete('/', clearCart);

// Guest cart merge (for after login)
router.post('/merge', mergeCarts);

module.exports = router;