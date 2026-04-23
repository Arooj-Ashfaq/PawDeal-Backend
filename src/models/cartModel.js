// src/models/cartModel.js
const DB = require('./db');

class CartModel extends DB {
    // Get or create cart for user
    static async getOrCreateCart(userId) {
        // Check if cart exists
        let cart = await this.getOne(
            'SELECT * FROM cart WHERE user_id = ?',
            [userId]
        );

        if (!cart) {
            // Create new cart
            const [result] = await this.query(
                'INSERT INTO cart (user_id, created_at, updated_at) VALUES (?, NOW(), NOW())',
                [userId]
            );
            
            cart = {
                id: result.insertId,
                user_id: userId
            };
        }

        return cart;
    }

    // Get cart with items
    static async getCartWithItems(userId) {
        const cart = await this.getOrCreateCart(userId);

        // Get cart items with product details
        const items = await this.query(
            `SELECT 
                ci.id, ci.quantity, ci.price_at_add, ci.added_at,
                p.id as product_id, p.name, p.description,
                p.price as current_price, p.sale_price,
                p.stock_quantity, p.sku,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as image,
                u.id as seller_id, u.first_name as seller_name,
                p.status as product_status
             FROM cart_items ci
             INNER JOIN products p ON ci.product_id = p.id
             LEFT JOIN users u ON p.seller_id = u.id
             WHERE ci.cart_id = ?`,
            [cart.id]
        );

        // Calculate totals
        let subtotal = 0;
        let discount = 0;
        const itemCount = items.length;

        items.forEach(item => {
            const price = item.sale_price || item.current_price;
            item.total = price * item.quantity;
            subtotal += item.total;
            
            if (item.sale_price) {
                discount += (item.current_price - item.sale_price) * item.quantity;
            }
        });

        return {
            id: cart.id,
            user_id: userId,
            items,
            summary: {
                item_count: itemCount,
                subtotal,
                discount,
                total: subtotal,
                shipping_estimate: 0 // Calculate based on items/seller
            },
            created_at: cart.created_at,
            updated_at: cart.updated_at
        };
    }

    // Add item to cart
    static async addItem(userId, productId, quantity = 1) {
        const cart = await this.getOrCreateCart(userId);

        // Check if product exists and is in stock
        const product = await this.getOne(
            'SELECT * FROM products WHERE id = ? AND status = "active"',
            [productId]
        );

        if (!product) {
            throw new Error('Product not found');
        }

        if (product.stock_quantity < quantity) {
            throw new Error('Insufficient stock');
        }

        // Check if item already in cart
        const existingItem = await this.getOne(
            'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?',
            [cart.id, productId]
        );

        if (existingItem) {
            // Update quantity
            const newQuantity = existingItem.quantity + quantity;
            
            if (product.stock_quantity < newQuantity) {
                throw new Error('Insufficient stock');
            }

            await this.query(
                `UPDATE cart_items 
                 SET quantity = ?, price_at_add = ?
                 WHERE id = ?`,
                [newQuantity, product.sale_price || product.price, existingItem.id]
            );
            
            return existingItem.id;
        } else {
            // Add new item
            const [result] = await this.query(
                `INSERT INTO cart_items (cart_id, product_id, quantity, price_at_add, added_at)
                 VALUES (?, ?, ?, ?, NOW())`,
                [cart.id, productId, quantity, product.sale_price || product.price]
            );

            return result.insertId;
        }
    }

    // Update cart item quantity
    static async updateItemQuantity(userId, itemId, quantity) {
        const cart = await this.getOrCreateCart(userId);

        // Get item
        const item = await this.getOne(
            `SELECT ci.*, p.stock_quantity 
             FROM cart_items ci
             INNER JOIN products p ON ci.product_id = p.id
             WHERE ci.id = ? AND ci.cart_id = ?`,
            [itemId, cart.id]
        );

        if (!item) {
            throw new Error('Cart item not found');
        }

        if (quantity <= 0) {
            // Remove item
            await this.query('DELETE FROM cart_items WHERE id = ?', [itemId]);
            return { removed: true };
        }

        if (item.stock_quantity < quantity) {
            throw new Error('Insufficient stock');
        }

        await this.query(
            'UPDATE cart_items SET quantity = ? WHERE id = ?',
            [quantity, itemId]
        );

        return { updated: true, quantity };
    }

    // Remove item from cart
    static async removeItem(userId, itemId) {
        const cart = await this.getOrCreateCart(userId);

        await this.query(
            'DELETE FROM cart_items WHERE id = ? AND cart_id = ?',
            [itemId, cart.id]
        );

        return true;
    }

    // Clear cart
    static async clearCart(userId) {
        const cart = await this.getOrCreateCart(userId);

        await this.query('DELETE FROM cart_items WHERE cart_id = ?', [cart.id]);

        return true;
    }

    // Get cart item count
    static async getItemCount(userId) {
        const cart = await this.getOrCreateCart(userId);

        const [result] = await this.query(
            'SELECT SUM(quantity) as count FROM cart_items WHERE cart_id = ?',
            [cart.id]
        );

        return result.count || 0;
    }

    // Validate cart items (check stock, prices)
    static async validateCart(userId) {
        const cart = await this.getCartWithItems(userId);
        const issues = [];

        for (const item of cart.items) {
            // Check stock
            if (item.stock_quantity < item.quantity) {
                issues.push({
                    item_id: item.id,
                    product_id: item.product_id,
                    name: item.name,
                    issue: 'insufficient_stock',
                    available: item.stock_quantity,
                    requested: item.quantity
                });
            }

            // Check if product still active
            if (item.product_status !== 'active') {
                issues.push({
                    item_id: item.id,
                    product_id: item.product_id,
                    name: item.name,
                    issue: 'product_unavailable',
                    status: item.product_status
                });
            }

            // Check if price changed
            const currentPrice = item.sale_price || item.current_price;
            if (currentPrice !== item.price_at_add) {
                issues.push({
                    item_id: item.id,
                    product_id: item.product_id,
                    name: item.name,
                    issue: 'price_changed',
                    old_price: item.price_at_add,
                    new_price: currentPrice
                });
            }
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }

    // Group cart items by seller
    static async groupBySeller(userId) {
        const cart = await this.getCartWithItems(userId);
        const bySeller = {};

        cart.items.forEach(item => {
            if (!bySeller[item.seller_id]) {
                bySeller[item.seller_id] = {
                    seller_id: item.seller_id,
                    seller_name: item.seller_name,
                    items: [],
                    subtotal: 0
                };
            }

            bySeller[item.seller_id].items.push(item);
            bySeller[item.seller_id].subtotal += item.total;
        });

        return Object.values(bySeller);
    }

    // Get abandoned carts (for admin)
    static async getAbandoned(hours = 24) {
        return await this.query(
            `SELECT c.*, u.email, u.first_name, u.last_name,
                    COUNT(ci.id) as item_count
             FROM cart c
             INNER JOIN users u ON c.user_id = u.id
             LEFT JOIN cart_items ci ON c.id = ci.cart_id
             WHERE c.updated_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
               AND c.updated_at > DATE_SUB(NOW(), INTERVAL ? * 2 HOUR)
             GROUP BY c.id
             ORDER BY c.updated_at DESC`,
            [hours, hours]
        );
    }

    // Merge guest cart with user cart (after login)
    static async mergeCarts(userId, guestCartId) {
        const userCart = await this.getOrCreateCart(userId);

        // Get guest cart items
        const guestItems = await this.query(
            'SELECT * FROM cart_items WHERE cart_id = ?',
            [guestCartId]
        );

        for (const item of guestItems) {
            try {
                await this.addItem(userId, item.product_id, item.quantity);
            } catch (error) {
                console.error('Failed to move item:', error);
            }
        }

        // Delete guest cart
        await this.query('DELETE FROM cart WHERE id = ?', [guestCartId]);

        return userCart.id;
    }

    // Get cart summary for checkout
    static async getCheckoutSummary(userId) {
        const cart = await this.getCartWithItems(userId);
        
        if (cart.items.length === 0) {
            throw new Error('Cart is empty');
        }

        // Validate cart before checkout
        const validation = await this.validateCart(userId);
        if (!validation.valid) {
            throw new Error('Cart has issues that need to be resolved');
        }

        // Group by seller for shipping calculations
        const bySeller = await this.groupBySeller(userId);

        // Calculate shipping (simplified - would integrate with shipping API)
        const shipping = {
            method: 'standard',
            cost: 0,
            estimated_days: '3-5 business days'
        };

        // Calculate tax (simplified - would integrate with tax API)
        const tax = {
            rate: 0.1, // 10% example
            amount: cart.summary.subtotal * 0.1
        };

        const summary = {
            items: cart.items,
            by_seller: bySeller,
            subtotal: cart.summary.subtotal,
            shipping: shipping.cost,
            tax: tax.amount,
            discount: cart.summary.discount,
            total: cart.summary.subtotal + shipping.cost + tax.amount - cart.summary.discount,
            item_count: cart.items.length,
            total_quantity: cart.items.reduce((sum, item) => sum + item.quantity, 0)
        };

        return summary;
    }

    // Clean up expired carts (cron job)
    static async cleanupExpired(days = 30) {
        // Find old carts
        const oldCarts = await this.query(
            `SELECT id FROM cart 
             WHERE updated_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );

        for (const cart of oldCarts) {
            await this.query('DELETE FROM cart_items WHERE cart_id = ?', [cart.id]);
            await this.query('DELETE FROM cart WHERE id = ?', [cart.id]);
        }

        return oldCarts.length;
    }
}

module.exports = CartModel;