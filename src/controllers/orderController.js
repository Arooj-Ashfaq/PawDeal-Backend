// src/controllers/orderController.js
const OrderModel = require('../models/orderModel');
const CartModel = require('../models/cartModel');
const ProductModel = require('../models/productModel');
const PetModel = require('../models/petModel');
const UserModel = require('../models/userModel');
const { generateOrderNumber } = require('../utils/helpers');
const { sendOrderConfirmationEmail } = require('../services/emailService');

// Create order from cart
const createOrder = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get cart with validation
        const validation = await CartModel.validateCart(userId);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: 'Cart has issues',
                issues: validation.issues
            });
        }

        // Get cart summary for checkout
        const summary = await CartModel.getCheckoutSummary(userId);

        // Create order
        const { id: orderId, order_number } = await OrderModel.create({
            buyer_id: userId,
            order_type: 'mixed', // Could be determined by cart items
            subtotal: summary.subtotal,
            tax: summary.tax,
            shipping_cost: summary.shipping,
            discount_amount: summary.discount,
            total_amount: summary.total,
            currency: 'USD',
            payment_method: req.body.payment_method || 'credit_card',
            shipping_address: req.body.shipping_address,
            billing_address: req.body.billing_address || req.body.shipping_address,
            buyer_notes: req.body.notes
        });

        // Add items to order and update stock
        for (const item of summary.items) {
            await OrderModel.addItem(orderId, {
                item_type: 'product',
                item_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.price_at_add,
                total_price: item.total,
                seller_id: item.seller_id
            });
        }

        // Clear cart
        await CartModel.clearCart(userId);

        // Get user for email
        const user = await UserModel.findById(userId);
        
        // Send confirmation email
        await sendOrderConfirmationEmail(user, {
            id: orderId,
            order_number,
            total_amount: summary.total
        });

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            orderId,
            order_number
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create order'
        });
    }
};

// Create direct order (single item, e.g., pet)
const createDirectOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { item_type, item_id, quantity = 1 } = req.body;

        let item = null;
        let sellerId = null;
        let price = 0;

        if (item_type === 'pet') {
            item = await PetModel.findById(item_id);
            if (!item) {
                return res.status(404).json({
                    success: false,
                    error: 'Pet not found'
                });
            }
            if (item.status !== 'available') {
                return res.status(400).json({
                    success: false,
                    error: 'Pet is not available'
                });
            }
            sellerId = item.seller_id;
            price = item.price;
        } else if (item_type === 'product') {
            item = await ProductModel.findById(item_id);
            if (!item) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found'
                });
            }
            const available = await ProductModel.checkStock(item_id, quantity);
            if (!available) {
                return res.status(400).json({
                    success: false,
                    error: 'Insufficient stock'
                });
            }
            sellerId = item.seller_id;
            price = item.sale_price || item.price;
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid item type'
            });
        }

        // Create order
        const { id: orderId, order_number } = await OrderModel.create({
            buyer_id: userId,
            order_type: item_type,
            subtotal: price * quantity,
            tax: req.body.tax || 0,
            shipping_cost: req.body.shipping_cost || 0,
            discount_amount: 0,
            total_amount: (price * quantity) + (req.body.tax || 0) + (req.body.shipping_cost || 0),
            currency: 'USD',
            payment_method: req.body.payment_method || 'credit_card',
            shipping_address: req.body.shipping_address,
            billing_address: req.body.billing_address || req.body.shipping_address,
            buyer_notes: req.body.notes
        });

        // Add item to order
        await OrderModel.addItem(orderId, {
            item_type,
            item_id,
            quantity,
            unit_price: price,
            total_price: price * quantity,
            seller_id: sellerId
        });

        // Update stock/product status
        if (item_type === 'product') {
            await ProductModel.updateStock(item_id, -quantity);
        } else if (item_type === 'pet') {
            await PetModel.updateStatus(item_id, 'sold');
        }

        // Get user for email
        const user = await UserModel.findById(userId);
        
        // Send confirmation email
        await sendOrderConfirmationEmail(user, {
            id: orderId,
            order_number,
            total_amount: (price * quantity) + (req.body.tax || 0) + (req.body.shipping_cost || 0)
        });

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            orderId,
            order_number
        });
    } catch (error) {
        console.error('Create direct order error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create order'
        });
    }
};

// Get order by ID
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const order = await OrderModel.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Check if user is authorized (buyer, seller of any item, or admin)
        const isBuyer = order.buyer_id === userId;
        const isSeller = order.items.some(item => item.seller_id === userId);
        
        if (!isBuyer && !isSeller && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to view this order'
            });
        }

        // Get timeline
        order.timeline = await OrderModel.getTimeline(id);

        res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch order'
        });
    }
};

// Get order by order number
const getOrderByNumber = async (req, res) => {
    try {
        const { orderNumber } = req.params;
        const userId = req.user.id;

        const order = await OrderModel.findByOrderNumber(orderNumber);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Check if user is authorized
        const isBuyer = order.buyer_id === userId;
        const isSeller = order.items.some(item => item.seller_id === userId);
        
        if (!isBuyer && !isSeller && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to view this order'
            });
        }

        res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error('Get order by number error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch order'
        });
    }
};

// Get user orders
const getUserOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, status } = req.query;

        let orders;
        if (status) {
            // Filter by status
            const result = await OrderModel.query(
                `SELECT o.* FROM orders o
                 WHERE o.buyer_id = ? AND o.status = ?
                 ORDER BY o.created_at DESC
                 LIMIT ? OFFSET ?`,
                [userId, status, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]
            );
            
            const [total] = await OrderModel.query(
                'SELECT COUNT(*) as count FROM orders WHERE buyer_id = ? AND status = ?',
                [userId, status]
            );

            orders = {
                data: result,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total.count,
                    pages: Math.ceil(total.count / limit)
                }
            };
        } else {
            orders = await OrderModel.findByBuyer(userId, page, limit);
        }

        res.json({
            success: true,
            ...orders
        });
    } catch (error) {
        console.error('Get user orders error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch orders'
        });
    }
};

// Get seller orders
const getSellerOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, status } = req.query;

        // Check if user is seller
        const isSeller = await UserModel.isSeller(userId);
        if (!isSeller) {
            return res.status(403).json({
                success: false,
                error: 'You are not a seller'
            });
        }

        let orders;
        if (status) {
            // Filter by status
            const result = await OrderModel.query(
                `SELECT DISTINCT o.* FROM orders o
                 INNER JOIN order_items oi ON o.id = oi.order_id
                 WHERE oi.seller_id = ? AND o.status = ?
                 ORDER BY o.created_at DESC
                 LIMIT ? OFFSET ?`,
                [userId, status, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]
            );
            
            const [total] = await OrderModel.query(
                `SELECT COUNT(DISTINCT o.id) as count FROM orders o
                 INNER JOIN order_items oi ON o.id = oi.order_id
                 WHERE oi.seller_id = ? AND o.status = ?`,
                [userId, status]
            );

            orders = {
                data: result,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total.count,
                    pages: Math.ceil(total.count / limit)
                }
            };
        } else {
            orders = await OrderModel.findBySeller(userId, page, limit);
        }

        res.json({
            success: true,
            ...orders
        });
    } catch (error) {
        console.error('Get seller orders error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch seller orders'
        });
    }
};

// Update order status (seller)
const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user.id;

        const order = await OrderModel.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Check if user is seller of any item in the order
        const isSeller = order.items.some(item => item.seller_id === userId);
        
        if (!isSeller && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to update this order'
            });
        }

        await OrderModel.updateStatus(id, status);

        res.json({
            success: true,
            message: `Order status updated to ${status}`
        });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update order status'
        });
    }
};

// Update payment status
const updatePaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_status, payment_id } = req.body;
        const userId = req.user.id;

        const order = await OrderModel.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Check if user is buyer or admin
        if (order.buyer_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to update payment status'
            });
        }

        await OrderModel.updatePaymentStatus(id, payment_status, payment_id);

        res.json({
            success: true,
            message: `Payment status updated to ${payment_status}`
        });
    } catch (error) {
        console.error('Update payment status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update payment status'
        });
    }
};

// Cancel order
const cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;

        const order = await OrderModel.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Check if user is buyer or admin
        if (order.buyer_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to cancel this order'
            });
        }

        // Check if order can be cancelled
        if (!['pending', 'payment_received'].includes(order.status)) {
            return res.status(400).json({
                success: false,
                error: 'Order cannot be cancelled at this stage'
            });
        }

        await OrderModel.cancel(id, reason);

        res.json({
            success: true,
            message: 'Order cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel order'
        });
    }
};

// Get order statistics for seller
const getSellerStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = '30d' } = req.query;

        // Check if user is seller
        const isSeller = await UserModel.isSeller(userId);
        if (!isSeller) {
            return res.status(403).json({
                success: false,
                error: 'You are not a seller'
            });
        }

        const stats = await OrderModel.getSellerStats(userId, period);

        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        console.error('Get seller stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get seller statistics'
        });
    }
};

// Get order statistics for admin
const getAdminStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const { period = '30d' } = req.query;

        const stats = await OrderModel.getAdminStats(period);

        // Recent orders
        const recentOrders = await OrderModel.getRecent(10);

        res.json({
            success: true,
            stats,
            recent_orders: recentOrders
        });
    } catch (error) {
        console.error('Get admin stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get admin statistics'
        });
    }
};

// Track order
const trackOrder = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await OrderModel.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Public tracking info (no sensitive data)
        const tracking = {
            order_number: order.order_number,
            status: order.status,
            payment_status: order.payment_status,
            created_at: order.created_at,
            estimated_delivery: order.estimated_delivery,
            timeline: await OrderModel.getTimeline(id),
            items: order.items.map(item => ({
                name: item.item_name,
                quantity: item.quantity,
                image: item.item_image
            }))
        };

        res.json({
            success: true,
            tracking
        });
    } catch (error) {
        console.error('Track order error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to track order'
        });
    }
};

// Request refund
const requestRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;

        const order = await OrderModel.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Check if user is buyer
        if (order.buyer_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to request refund for this order'
            });
        }

        // Check if order is eligible for refund
        if (!['delivered', 'shipped'].includes(order.status)) {
            return res.status(400).json({
                success: false,
                error: 'Order is not eligible for refund'
            });
        }

        // Update order with refund request
        await OrderModel.update(id, {
            status: 'refund_requested',
            seller_notes: `Refund requested: ${reason}`
        });

        res.json({
            success: true,
            message: 'Refund request submitted successfully'
        });
    } catch (error) {
        console.error('Request refund error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to request refund'
        });
    }
};

// Process refund (admin)
const processRefund = async (req, res) => {
    try {
        const { id } = req.params;
        const { approved, reason } = req.body;

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const order = await OrderModel.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        if (approved) {
            await OrderModel.update(id, {
                status: 'refunded',
                payment_status: 'refunded',
                seller_notes: `Refund approved: ${reason || 'Approved'}`
            });

            // Restore stock for products
            for (const item of order.items) {
                if (item.item_type === 'product') {
                    await ProductModel.updateStock(item.item_id, item.quantity);
                }
                if (item.item_type === 'pet') {
                    await PetModel.updateStatus(item.item_id, 'available');
                }
            }
        } else {
            await OrderModel.update(id, {
                status: 'delivered',
                seller_notes: `Refund rejected: ${reason || 'Rejected'}`
            });
        }

        res.json({
            success: true,
            message: approved ? 'Refund processed successfully' : 'Refund request rejected'
        });
    } catch (error) {
        console.error('Process refund error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process refund'
        });
    }
};

// Export orders (admin)
const exportOrders = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const { start_date, end_date } = req.query;

        let query = `
            SELECT 
                o.order_number, o.created_at, o.status, o.payment_status,
                o.total_amount, o.currency,
                u_buyer.email as buyer_email,
                u_buyer.first_name as buyer_first_name,
                u_buyer.last_name as buyer_last_name,
                COUNT(oi.id) as item_count
            FROM orders o
            LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE 1=1
        `;
        const params = [];

        if (start_date) {
            query += ' AND DATE(o.created_at) >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND DATE(o.created_at) <= ?';
            params.push(end_date);
        }

        query += ' GROUP BY o.id ORDER BY o.created_at DESC';

        const orders = await OrderModel.query(query, params);

        // Convert to CSV
        const csv = [
            ['Order Number', 'Date', 'Buyer', 'Email', 'Items', 'Total', 'Status', 'Payment Status'].join(','),
            ...orders.map(o => [
                o.order_number,
                o.created_at,
                `${o.buyer_first_name} ${o.buyer_last_name}`,
                o.buyer_email,
                o.item_count,
                o.total_amount,
                o.status,
                o.payment_status
            ].join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
        res.send(csv);
    } catch (error) {
        console.error('Export orders error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export orders'
        });
    }
};

module.exports = {
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
};