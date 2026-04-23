// src/controllers/dashboardController.js
const UserModel = require('../models/userModel');
const PetModel = require('../models/petModel');
const ProductModel = require('../models/productModel');
const OrderModel = require('../models/orderModel');
const MessageModel = require('../models/messageModel');
const FavoriteModel = require('../models/favoriteModel');
const AnalyticsModel = require('../models/analyticsModel');
const SubscriptionModel = require('../models/subscriptionModel');

// Get buyer dashboard
const getBuyerDashboard = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get recent orders
        const recentOrders = await OrderModel.findByBuyer(userId, 1, 5);

        // Get favorites with counts
        const favorites = await FavoriteModel.getCounts(userId);
        const recentFavorites = await FavoriteModel.getAllUserFavorites(userId, 1, 5);

        // Get unread messages count
        const unreadMessages = await MessageModel.getUnreadCount(userId);

        // Get subscription status
        const subscription = await SubscriptionModel.getUserStatus(userId);

        // Get recommended items based on purchase history
        let recommendedPets = [];
        let recommendedProducts = [];

        if (recentOrders.data.length > 0) {
            // Get categories from recent orders
            const orderIds = recentOrders.data.map(o => o.id);
            const orderItems = await OrderModel.query(
                `SELECT DISTINCT item_type, item_id FROM order_items WHERE order_id IN (?)`,
                [orderIds]
            );

            // Get similar items (simplified - you'd want more sophisticated recommendation logic)
            for (const item of orderItems.slice(0, 3)) {
                if (item.item_type === 'pet') {
                    const pet = await PetModel.findById(item.item_id);
                    if (pet) {
                        const similar = await PetModel.getSimilar(pet.id, 3);
                        recommendedPets = [...recommendedPets, ...similar];
                    }
                } else if (item.item_type === 'product') {
                    const product = await ProductModel.findById(item.item_id);
                    if (product) {
                        const related = await ProductModel.getRelated(product.id, 3);
                        recommendedProducts = [...recommendedProducts, ...related];
                    }
                }
            }
        }

        // Remove duplicates
        recommendedPets = [...new Map(recommendedPets.map(item => [item.id, item])).values()].slice(0, 4);
        recommendedProducts = [...new Map(recommendedProducts.map(item => [item.id, item])).values()].slice(0, 4);

        res.json({
            success: true,
            dashboard: {
                summary: {
                    total_orders: recentOrders.pagination?.total || 0,
                    favorites_count: favorites.total,
                    unread_messages: unreadMessages,
                    subscription: subscription
                },
                recent_orders: recentOrders.data,
                recent_favorites: recentFavorites.data,
                recommendations: {
                    pets: recommendedPets,
                    products: recommendedProducts
                }
            }
        });
    } catch (error) {
        console.error('Get buyer dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load buyer dashboard'
        });
    }
};

// Get seller dashboard
const getSellerDashboard = async (req, res) => {
    try {
        const userId = req.user.id;

        // Check if user is seller
        const isSeller = await UserModel.isSeller(userId);
        if (!isSeller) {
            return res.status(403).json({
                success: false,
                error: 'You are not a seller'
            });
        }

        // Get seller profile
        const seller = await UserModel.findById(userId);

        // Get listing stats
        const petStats = await PetModel.getSellerStats(userId);
        const productStats = await ProductModel.getSellerStats(userId);

        // Get recent orders
        const recentOrders = await OrderModel.findBySeller(userId, 1, 5);

        // Get unread messages
        const unreadMessages = await MessageModel.getUnreadCount(userId);

        // Get low stock alerts
        const lowStock = await ProductModel.getLowStock(userId, 5);

        // Get subscription status
        const subscription = await SubscriptionModel.getUserStatus(userId);

        // Get analytics for last 30 days
        const analytics = await AnalyticsModel.getPetViews(userId, '30d');

        // Get top performing items
        const topPets = await PetModel.query(
            `SELECT id, name, view_count, favorite_count 
             FROM pets 
             WHERE seller_id = ? 
             ORDER BY view_count DESC 
             LIMIT 5`,
            [userId]
        );

        const topProducts = await ProductModel.query(
            `SELECT id, name, view_count, purchase_count 
             FROM products 
             WHERE seller_id = ? 
             ORDER BY view_count DESC 
             LIMIT 5`,
            [userId]
        );

        // Get pending reviews
        const pendingReviews = await OrderModel.query(
            `SELECT COUNT(*) as count FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             WHERE oi.seller_id = ? AND o.status = 'delivered' 
             AND o.completed_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
            [userId]
        );

        res.json({
            success: true,
            dashboard: {
                seller_info: {
                    store_name: seller.store_name,
                    verification_status: seller.verification_status,
                    seller_rating: seller.seller_rating,
                    total_sales: seller.total_sales
                },
                summary: {
                    total_pets: petStats?.total_listings || 0,
                    active_pets: petStats?.active_listings || 0,
                    total_products: productStats?.total_products || 0,
                    active_products: productStats?.active_products || 0,
                    pending_orders: recentOrders.pagination?.total || 0,
                    unread_messages: unreadMessages,
                    low_stock_count: lowStock.length,
                    pending_reviews: pendingReviews[0]?.count || 0,
                    subscription: subscription
                },
                recent_orders: recentOrders.data,
                low_stock: lowStock,
                analytics: {
                    views: analytics.summary,
                    daily: analytics.daily
                },
                top_performing: {
                    pets: topPets,
                    products: topProducts
                }
            }
        });
    } catch (error) {
        console.error('Get seller dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load seller dashboard'
        });
    }
};

// Get admin dashboard
const getAdminDashboard = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        // Get platform stats
        const [
            userStats,
            petStats,
            productStats,
            orderStats,
            sellerStats,
            revenueStats
        ] = await Promise.all([
            // User stats
            UserModel.query(`
                SELECT 
                    COUNT(*) as total_users,
                    SUM(CASE WHEN account_status = 'active' THEN 1 ELSE 0 END) as active_users,
                    SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
                    SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_users_week
                FROM users
            `),

            // Pet stats
            PetModel.query(`
                SELECT 
                    COUNT(*) as total_pets,
                    SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_pets,
                    SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_pets,
                    AVG(price) as avg_pet_price
                FROM pets
                WHERE deleted_at IS NULL
            `),

            // Product stats
            ProductModel.query(`
                SELECT 
                    COUNT(*) as total_products,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_products,
                    AVG(price) as avg_product_price,
                    SUM(stock_quantity) as total_inventory
                FROM products
                WHERE deleted_at IS NULL
            `),

            // Order stats
            OrderModel.query(`
                SELECT 
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as orders_today,
                    SUM(total_amount) as total_revenue,
                    AVG(total_amount) as avg_order_value
                FROM orders
            `),

            // Seller stats
            UserModel.query(`
                SELECT 
                    COUNT(*) as total_sellers,
                    SUM(CASE WHEN verification_status = 'pending' THEN 1 ELSE 0 END) as pending_verification
                FROM sellers
            `),

            // Revenue by period
            OrderModel.query(`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as order_count,
                    SUM(total_amount) as revenue
                FROM orders
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `)
        ]);

        // Get pending seller verifications
        const pendingSellers = await UserModel.query(
            `SELECT u.id, u.email, u.first_name, u.last_name, 
                    u.created_at, s.store_name, s.business_name
             FROM users u
             INNER JOIN sellers s ON u.id = s.user_id
             WHERE s.verification_status = 'pending'
             ORDER BY u.created_at DESC
             LIMIT 10`
        );

        // Get recent reports (you'd need a reports table)
        const recentReports = []; // Placeholder

        // Get system health
        const systemHealth = {
            database: 'connected',
            storage: 'healthy',
            last_backup: '2024-01-01 00:00:00' // You'd get this from backup logs
        };

        res.json({
            success: true,
            dashboard: {
                summary: {
                    users: userStats[0],
                    pets: petStats[0],
                    products: productStats[0],
                    orders: orderStats[0],
                    sellers: sellerStats[0],
                    revenue: revenueStats
                },
                pending_verifications: pendingSellers,
                recent_reports: recentReports,
                system_health: systemHealth,
                charts: {
                    revenue: revenueStats
                }
            }
        });
    } catch (error) {
        console.error('Get admin dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load admin dashboard'
        });
    }
};

// Get analytics dashboard (for sellers)
const getAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = '30d' } = req.query;

        // Check if user has analytics access
        const hasAccess = await SubscriptionModel.checkLimit(userId, 'analytics_access');
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Analytics access requires a Pro or Premium subscription'
            });
        }

        // Get pet analytics
        const petAnalytics = await AnalyticsModel.getPetViews(userId, period);

        // Get product analytics
        const productAnalytics = await AnalyticsModel.query(
            `SELECT 
                COUNT(DISTINCT a.target_id) as viewed_products,
                SUM(CASE WHEN a.event_type = 'product_view' THEN 1 ELSE 0 END) as total_views,
                AVG(p.rating_avg) as avg_rating
             FROM analytics_events a
             INNER JOIN products p ON a.target_id = p.id
             WHERE a.event_type = 'product_view' 
               AND p.seller_id = ?
               AND a.timestamp >= DATE_SUB(NOW(), INTERVAL ?)`,
            [userId, period === '7d' ? '7 DAY' : period === '30d' ? '30 DAY' : '90 DAY']
        );

        // Get conversion data
        const conversionData = await AnalyticsModel.getConversionFunnel(period);

        // Get traffic sources (simplified)
        const trafficSources = await AnalyticsModel.query(
            `SELECT 
                CASE 
                    WHEN user_agent LIKE '%Facebook%' THEN 'Facebook'
                    WHEN user_agent LIKE '%Twitter%' THEN 'Twitter'
                    WHEN user_agent LIKE '%Instagram%' THEN 'Instagram'
                    WHEN user_agent LIKE '%Google%' THEN 'Google'
                    ELSE 'Direct'
                END as source,
                COUNT(*) as visits
             FROM analytics_events
             WHERE event_type = 'page_view'
               AND timestamp >= DATE_SUB(NOW(), INTERVAL ?)
             GROUP BY source
             ORDER BY visits DESC`,
            [period === '7d' ? '7 DAY' : period === '30d' ? '30 DAY' : '90 DAY']
        );

        res.json({
            success: true,
            analytics: {
                pets: petAnalytics,
                products: productAnalytics[0] || {},
                conversion: conversionData,
                traffic: trafficSources
            }
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load analytics'
        });
    }
};

// Get earnings report
const getEarningsReport = async (req, res) => {
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

        const earnings = await OrderModel.getSellerStats(userId, period);

        // Get pending payouts
        const pendingPayouts = await OrderModel.query(
            `SELECT SUM(total_amount) as amount
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             WHERE oi.seller_id = ? 
               AND o.status = 'delivered'
               AND o.payment_status = 'paid'
               AND o.completed_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`,
            [userId]
        );

        // Get payment history (simplified)
        const paymentHistory = await OrderModel.query(
            `SELECT 
                o.order_number,
                o.created_at,
                o.total_amount,
                o.status
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             WHERE oi.seller_id = ? 
               AND o.status IN ('delivered', 'refunded')
             ORDER BY o.created_at DESC
             LIMIT 20`,
            [userId]
        );

        res.json({
            success: true,
            report: {
                summary: earnings.summary,
                daily: earnings.daily,
                pending_payout: pendingPayouts[0]?.amount || 0,
                recent_payments: paymentHistory
            }
        });
    } catch (error) {
        console.error('Get earnings report error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load earnings report'
        });
    }
};

// Get real-time stats
const getRealtimeStats = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get real-time analytics
        const realtime = await AnalyticsModel.getRealtime();

        // Get current online users (you'd need to track this via sockets)
        const onlineUsers = 0; // Placeholder

        // Get recent activity
        const recentActivity = await AnalyticsModel.query(
            `SELECT 
                event_type,
                target_type,
                COUNT(*) as count
             FROM analytics_events
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
             GROUP BY event_type, target_type
             ORDER BY count DESC
             LIMIT 10`,
            []
        );

        res.json({
            success: true,
            realtime: {
                ...realtime,
                online_users: onlineUsers,
                recent_activity: recentActivity
            }
        });
    } catch (error) {
        console.error('Get realtime stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load realtime stats'
        });
    }
};

// Export dashboard data
const exportDashboardData = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, format = 'json' } = req.query;

        let data = {};

        switch (type) {
            case 'sales':
                data = await OrderModel.getSellerStats(userId, '90d');
                break;
            case 'products':
                data = await ProductModel.getSellerStats(userId);
                break;
            case 'pets':
                data = await PetModel.getSellerStats(userId);
                break;
            case 'analytics':
                data = await AnalyticsModel.getPetViews(userId, '90d');
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid export type'
                });
        }

        if (format === 'csv') {
            // Convert to CSV
            const csv = convertToCSV(data);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${type}_report.csv`);
            res.send(csv);
        } else {
            res.json({
                success: true,
                data
            });
        }
    } catch (error) {
        console.error('Export dashboard data error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export data'
        });
    }
};

// Helper function to convert to CSV
const convertToCSV = (data) => {
    if (!data || typeof data !== 'object') return '';

    const headers = [];
    const rows = [];

    if (Array.isArray(data)) {
        if (data.length === 0) return '';
        headers.push(...Object.keys(data[0]));
        rows.push(headers.join(','));
        data.forEach(item => {
            rows.push(Object.values(item).join(','));
        });
    } else {
        headers.push('Key', 'Value');
        rows.push(headers.join(','));
        Object.entries(data).forEach(([key, value]) => {
            rows.push(`${key},${value}`);
        });
    }

    return rows.join('\n');
};

// Get notification settings
const getNotificationSettings = async (req, res) => {
    try {
        const userId = req.user.id;

        const profile = await UserModel.getOne(
            'SELECT notification_preferences FROM user_profiles WHERE user_id = ?',
            [userId]
        );

        const defaultPrefs = {
            email: true,
            push: true,
            messages: true,
            orders: true,
            promotions: false
        };

        const preferences = profile?.notification_preferences 
            ? JSON.parse(profile.notification_preferences) 
            : defaultPrefs;

        res.json({
            success: true,
            preferences
        });
    } catch (error) {
        console.error('Get notification settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load notification settings'
        });
    }
};

// Update notification settings
const updateNotificationSettings = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            email, push, messages, orders, promotions
        } = req.body;

        const preferences = {
            email: email !== false,
            push: push !== false,
            messages: messages !== false,
            orders: orders !== false,
            promotions: promotions === true
        };

        await UserModel.query(
            `UPDATE user_profiles 
             SET notification_preferences = ?
             WHERE user_id = ?`,
            [JSON.stringify(preferences), userId]
        );

        res.json({
            success: true,
            message: 'Notification settings updated',
            preferences
        });
    } catch (error) {
        console.error('Update notification settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update notification settings'
        });
    }
};

module.exports = {
    getBuyerDashboard,
    getSellerDashboard,
    getAdminDashboard,
    getAnalytics,
    getEarningsReport,
    getRealtimeStats,
    exportDashboardData,
    getNotificationSettings,
    updateNotificationSettings
};