// src/models/orderModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class OrderModel extends DB {
    // Create new order
    static async create(orderData) {
        const {
            buyer_id, order_type, subtotal, tax, shipping_cost,
            discount_amount, total_amount, currency = 'USD',
            payment_method, shipping_address, billing_address,
            buyer_notes, seller_notes
        } = orderData;

        const id = uuidv4();
        const order_number = await this.generateOrderNumber();

        await this.query(
            `INSERT INTO orders (
                id, order_number, buyer_id, order_type, subtotal,
                tax, shipping_cost, discount_amount, total_amount,
                currency, status, payment_status, payment_method,
                shipping_address, billing_address, buyer_notes,
                seller_notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?, ?, ?, ?, NOW(), NOW())`,
            [id, order_number, buyer_id, order_type, subtotal,
             tax, shipping_cost, discount_amount, total_amount,
             currency, payment_method, JSON.stringify(shipping_address),
             JSON.stringify(billing_address), buyer_notes, seller_notes]
        );

        return { id, order_number };
    }

    // Generate unique order number
    static async generateOrderNumber() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        // Get count of orders today
        const [result] = await this.query(
            `SELECT COUNT(*) as count FROM orders 
             WHERE DATE(created_at) = CURDATE()`
        );
        
        const sequence = String(result.count + 1).padStart(4, '0');
        return `ORD-${year}${month}${day}-${sequence}`;
    }

    // Find order by ID
    static async findById(id) {
        const order = await this.getOne(
            `SELECT o.*, 
                    u_buyer.email as buyer_email, 
                    u_buyer.first_name as buyer_first_name,
                    u_buyer.last_name as buyer_last_name,
                    u_buyer.phone as buyer_phone
             FROM orders o
             LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
             WHERE o.id = ?`,
            [id]
        );

        if (order) {
            // Parse JSON fields
            if (order.shipping_address) order.shipping_address = JSON.parse(order.shipping_address);
            if (order.billing_address) order.billing_address = JSON.parse(order.billing_address);

            // Get order items
            order.items = await this.query(
                `SELECT oi.*, 
                        CASE 
                            WHEN oi.item_type = 'pet' THEN p.name
                            WHEN oi.item_type = 'product' THEN pr.name
                        END as item_name,
                        CASE 
                            WHEN oi.item_type = 'pet' THEN (SELECT image_url FROM pet_images WHERE pet_id = oi.item_id AND is_primary = 1 LIMIT 1)
                            WHEN oi.item_type = 'product' THEN (SELECT image_url FROM product_images WHERE product_id = oi.item_id AND is_primary = 1 LIMIT 1)
                        END as item_image
                 FROM order_items oi
                 LEFT JOIN pets p ON oi.item_type = 'pet' AND oi.item_id = p.id
                 LEFT JOIN products pr ON oi.item_type = 'product' AND oi.item_id = pr.id
                 WHERE oi.order_id = ?`,
                [id]
            );
        }

        return order;
    }

    // Find by order number
    static async findByOrderNumber(orderNumber) {
        const order = await this.getOne(
            'SELECT * FROM orders WHERE order_number = ?',
            [orderNumber]
        );

        if (order) {
            return await this.findById(order.id);
        }
        return null;
    }

    // Get orders for user (as buyer)
    static async findByBuyer(buyerId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const orders = await this.query(
            `SELECT o.*,
                    COUNT(oi.id) as item_count
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             WHERE o.buyer_id = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            [buyerId, limit, offset]
        );

        const [total] = await this.query(
            'SELECT COUNT(*) as count FROM orders WHERE buyer_id = ?',
            [buyerId]
        );

        return {
            data: orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Get orders for seller
    static async findBySeller(sellerId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const orders = await this.query(
            `SELECT DISTINCT o.*
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             WHERE oi.seller_id = ?
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            [sellerId, limit, offset]
        );

        const [total] = await this.query(
            `SELECT COUNT(DISTINCT o.id) as count
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             WHERE oi.seller_id = ?`,
            [sellerId]
        );

        return {
            data: orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Add item to order
    static async addItem(orderId, itemData) {
        const {
            item_type, item_id, quantity, unit_price,
            total_price, seller_id, status = 'pending'
        } = itemData;

        await this.query(
            `INSERT INTO order_items (
                order_id, item_type, item_id, quantity,
                unit_price, total_price, seller_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [orderId, item_type, item_id, quantity, unit_price, total_price, seller_id, status]
        );

        // Update product stock if item is product
        if (item_type === 'product') {
            await this.query(
                `UPDATE products 
                 SET stock_quantity = stock_quantity - ?,
                     purchase_count = purchase_count + 1
                 WHERE id = ?`,
                [quantity, item_id]
            );
        }

        // Update pet status if item is pet
        if (item_type === 'pet') {
            await this.query(
                `UPDATE pets 
                 SET status = 'sold'
                 WHERE id = ?`,
                [item_id]
            );
        }
    }

    // Update order status
    static async updateStatus(orderId, status, paymentStatus = null) {
        const updates = ['status = ?'];
        const params = [status];

        if (paymentStatus) {
            updates.push('payment_status = ?');
            params.push(paymentStatus);
        }

        if (status === 'delivered' || status === 'completed') {
            updates.push('completed_at = NOW()');
        }

        updates.push('updated_at = NOW()');
        params.push(orderId);

        await this.query(
            `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
    }

    // Update payment status
    static async updatePaymentStatus(orderId, paymentStatus, paymentId = null) {
        const updates = ['payment_status = ?', 'updated_at = NOW()'];
        const params = [paymentStatus];

        if (paymentId) {
            updates.push('payment_id = ?');
            params.push(paymentId);
        }

        if (paymentStatus === 'paid') {
            updates.push('status = "payment_received"');
        }

        params.push(orderId);

        await this.query(
            `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
    }

    // Cancel order
    static async cancel(orderId, reason = null) {
        // Get order items to restore stock
        const items = await this.query(
            'SELECT * FROM order_items WHERE order_id = ?',
            [orderId]
        );

        // Restore stock for products
        for (const item of items) {
            if (item.item_type === 'product') {
                await this.query(
                    'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
                    [item.quantity, item.item_id]
                );
            }
            if (item.item_type === 'pet') {
                await this.query(
                    'UPDATE pets SET status = "available" WHERE id = ?',
                    [item.item_id]
                );
            }
        }

        await this.query(
            `UPDATE orders 
             SET status = 'cancelled', 
                 updated_at = NOW(),
                 seller_notes = CONCAT(IFNULL(seller_notes, ''), '\\nCancelled: ', ?)
             WHERE id = ?`,
            [reason || 'Cancelled by user', orderId]
        );
    }

    // Get order statistics for seller
    static async getSellerStats(sellerId, period = '30d') {
        let dateFilter = '';
        switch(period) {
            case '7d':
                dateFilter = 'AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
                break;
            case '30d':
                dateFilter = 'AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
                break;
            case '90d':
                dateFilter = 'AND o.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)';
                break;
            case '1y':
                dateFilter = 'AND o.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
                break;
        }

        const stats = await this.getOne(
            `SELECT 
                COUNT(DISTINCT o.id) as total_orders,
                SUM(oi.total_price) as total_revenue,
                AVG(oi.total_price) as avg_order_value,
                COUNT(DISTINCT o.buyer_id) as unique_customers,
                SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) as completed_orders,
                SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             WHERE oi.seller_id = ? ${dateFilter}`,
            [sellerId]
        );

        // Get daily sales for chart
        const dailySales = await this.query(
            `SELECT 
                DATE(o.created_at) as date,
                COUNT(DISTINCT o.id) as order_count,
                SUM(oi.total_price) as revenue
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             WHERE oi.seller_id = ? ${dateFilter}
             GROUP BY DATE(o.created_at)
             ORDER BY date DESC
             LIMIT 30`,
            [sellerId]
        );

        return {
            summary: stats,
            daily: dailySales
        };
    }

    // Get order statistics for admin
    static async getAdminStats(period = '30d') {
        let dateFilter = '';
        switch(period) {
            case '7d':
                dateFilter = 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
                break;
            case '30d':
                dateFilter = 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
                break;
            case '90d':
                dateFilter = 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)';
                break;
        }

        const stats = await this.getOne(
            `SELECT 
                COUNT(*) as total_orders,
                SUM(total_amount) as total_revenue,
                AVG(total_amount) as avg_order_value,
                COUNT(DISTINCT buyer_id) as unique_customers,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as completed_orders,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders
             FROM orders
             ${dateFilter}`
        );

        // Orders by status
        const byStatus = await this.query(
            `SELECT 
                status,
                COUNT(*) as count,
                SUM(total_amount) as total
             FROM orders
             ${dateFilter}
             GROUP BY status`
        );

        return {
            summary: stats,
            byStatus
        };
    }

    // Get recent orders
    static async getRecent(limit = 10) {
        return await this.query(
            `SELECT o.*, u.first_name, u.last_name, u.email
             FROM orders o
             LEFT JOIN users u ON o.buyer_id = u.id
             ORDER BY o.created_at DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Check if user can review product from order
    static async canReview(userId, productId) {
        const order = await this.getOne(
            `SELECT oi.id
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             WHERE o.buyer_id = ? 
               AND oi.item_type = 'product'
               AND oi.item_id = ?
               AND o.status = 'delivered'
             LIMIT 1`,
            [userId, productId]
        );

        return !!order;
    }

    // Get order timeline
    static async getTimeline(orderId) {
        const order = await this.findById(orderId);
        
        const timeline = [
            {
                status: 'Order Placed',
                date: order.created_at,
                completed: true
            }
        ];

        if (order.payment_status === 'paid') {
            timeline.push({
                status: 'Payment Received',
                date: order.updated_at,
                completed: true
            });
        }

        if (order.status === 'processing') {
            timeline.push({
                status: 'Processing',
                date: order.updated_at,
                completed: true
            });
        }

        if (order.status === 'shipped') {
            timeline.push({
                status: 'Shipped',
                date: order.updated_at,
                completed: true
            });
        }

        if (order.status === 'delivered') {
            timeline.push({
                status: 'Delivered',
                date: order.completed_at,
                completed: true
            });
        }

        if (order.status === 'cancelled') {
            timeline.push({
                status: 'Cancelled',
                date: order.updated_at,
                completed: true
            });
        }

        return timeline;
    }
}

module.exports = OrderModel;