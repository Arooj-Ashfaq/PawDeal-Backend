// src/controllers/cartController.js
const CartModel = require('../models/cartModel');
const ProductModel = require('../models/productModel');
const OrderModel = require('../models/orderModel');

// Get user's cart
const getCart = async (req, res) => {
    try {
        const userId = req.user.id;

        const cart = await CartModel.getCartWithItems(userId);

        res.json({
            success: true,
            cart
        });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch cart'
        });
    }
};

// Add item to cart
const addToCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const { product_id, quantity = 1 } = req.body;

        if (!product_id) {
            return res.status(400).json({
                success: false,
                error: 'Product ID is required'
            });
        }

        const itemId = await CartModel.addItem(userId, product_id, quantity);

        // Get updated cart
        const cart = await CartModel.getCartWithItems(userId);

        res.json({
            success: true,
            message: 'Item added to cart',
            itemId,
            cart
        });
    } catch (error) {
        console.error('Add to cart error:', error);
        if (error.message === 'Product not found' || error.message === 'Insufficient stock') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        res.status(500).json({
            success: false,
            error: 'Failed to add item to cart'
        });
    }
};

// Update cart item quantity
const updateCartItem = async (req, res) => {
    try {
        const userId = req.user.id;
        const { itemId } = req.params;
        const { quantity } = req.body;

        if (!quantity || quantity < 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid quantity is required'
            });
        }

        const result = await CartModel.updateItemQuantity(userId, itemId, quantity);

        // Get updated cart
        const cart = await CartModel.getCartWithItems(userId);

        res.json({
            success: true,
            message: result.removed ? 'Item removed from cart' : 'Cart updated',
            cart
        });
    } catch (error) {
        console.error('Update cart error:', error);
        if (error.message === 'Cart item not found' || error.message === 'Insufficient stock') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        res.status(500).json({
            success: false,
            error: 'Failed to update cart'
        });
    }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
    try {
        const userId = req.user.id;
        const { itemId } = req.params;

        await CartModel.removeItem(userId, itemId);

        // Get updated cart
        const cart = await CartModel.getCartWithItems(userId);

        res.json({
            success: true,
            message: 'Item removed from cart',
            cart
        });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove item from cart'
        });
    }
};

// Clear cart
const clearCart = async (req, res) => {
    try {
        const userId = req.user.id;

        await CartModel.clearCart(userId);

        res.json({
            success: true,
            message: 'Cart cleared',
            cart: {
                items: [],
                summary: {
                    item_count: 0,
                    subtotal: 0,
                    total: 0
                }
            }
        });
    } catch (error) {
        console.error('Clear cart error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear cart'
        });
    }
};

// Get cart item count
const getCartCount = async (req, res) => {
    try {
        const userId = req.user.id;

        const count = await CartModel.getItemCount(userId);

        res.json({
            success: true,
            count
        });
    } catch (error) {
        console.error('Get cart count error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get cart count'
        });
    }
};

// Validate cart
const validateCart = async (req, res) => {
    try {
        const userId = req.user.id;

        const validation = await CartModel.validateCart(userId);

        res.json({
            success: true,
            ...validation
        });
    } catch (error) {
        console.error('Validate cart error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate cart'
        });
    }
};

// Get checkout summary
const getCheckoutSummary = async (req, res) => {
    try {
        const userId = req.user.id;

        const summary = await CartModel.getCheckoutSummary(userId);

        res.json({
            success: true,
            summary
        });
    } catch (error) {
        console.error('Get checkout summary error:', error);
        if (error.message === 'Cart is empty') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        res.status(500).json({
            success: false,
            error: 'Failed to get checkout summary'
        });
    }
};

// Merge guest cart with user cart (after login)
const mergeCarts = async (req, res) => {
    try {
        const userId = req.user.id;
        const { guestCartId } = req.body;

        if (!guestCartId) {
            return res.status(400).json({
                success: false,
                error: 'Guest cart ID required'
            });
        }

        await CartModel.mergeCarts(userId, guestCartId);

        // Get updated cart
        const cart = await CartModel.getCartWithItems(userId);

        res.json({
            success: true,
            message: 'Carts merged successfully',
            cart
        });
    } catch (error) {
        console.error('Merge carts error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to merge carts'
        });
    }
};

// Apply coupon to cart
const applyCoupon = async (req, res) => {
    try {
        const userId = req.user.id;
        const { couponCode } = req.body;

        // This would integrate with a coupon system
        // For now, return mock response
        const cart = await CartModel.getCartWithItems(userId);

        res.json({
            success: true,
            message: 'Coupon applied successfully',
            discount: 10.00,
            cart
        });
    } catch (error) {
        console.error('Apply coupon error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to apply coupon'
        });
    }
};

// Estimate shipping
const estimateShipping = async (req, res) => {
    try {
        const userId = req.user.id;
        const { zipCode, country } = req.body;

        const cart = await CartModel.getCartWithItems(userId);
        
        // Simple shipping estimate based on item count
        const shippingCost = cart.items.length * 5; // $5 per item
        const estimatedDays = '3-5 business days';

        res.json({
            success: true,
            shipping: {
                method: 'standard',
                cost: shippingCost,
                estimated_days: estimatedDays,
                zip_code: zipCode,
                country
            }
        });
    } catch (error) {
        console.error('Estimate shipping error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to estimate shipping'
        });
    }
};

// Save cart for later
const saveForLater = async (req, res) => {
    try {
        const userId = req.user.id;
        const { itemId } = req.params;

        // This would move item to a "saved for later" list
        // You'd need a saved_items table for this
        await CartModel.removeItem(userId, itemId);

        res.json({
            success: true,
            message: 'Item saved for later'
        });
    } catch (error) {
        console.error('Save for later error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save item for later'
        });
    }
};

// Get cart total
const getCartTotal = async (req, res) => {
    try {
        const userId = req.user.id;

        const cart = await CartModel.getCartWithItems(userId);

        res.json({
            success: true,
            total: cart.summary.total,
            subtotal: cart.summary.subtotal,
            item_count: cart.summary.item_count
        });
    } catch (error) {
        console.error('Get cart total error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get cart total'
        });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    getCartCount,
    validateCart,
    getCheckoutSummary,
    mergeCarts,
    applyCoupon,
    estimateShipping,
    saveForLater,
    getCartTotal
};