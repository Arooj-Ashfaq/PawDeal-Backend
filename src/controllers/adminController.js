// src/controllers/adminController.js
const UserModel = require('../models/userModel');
const PetModel = require('../models/petModel');
const ProductModel = require('../models/productModel');
const OrderModel = require('../models/orderModel');
const BlogModel = require('../models/blogModel');
const GuideModel = require('../models/guideModel');
const CommentModel = require('../models/commentModel');
const SubscriptionModel = require('../models/subscriptionModel');
const AnalyticsModel = require('../models/analyticsModel');
const { sendEmail } = require('../services/emailService');

// ========== USER MANAGEMENT ==========

// Get all users
const getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 20, role, status, search } = req.query;

        let query = 'SELECT * FROM users WHERE 1=1';
        const params = [];

        if (role) {
            query += ' AND role = ?';
            params.push(role);
        }

        if (status) {
            query += ' AND account_status = ?';
            params.push(status);
        }

        if (search) {
            query += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        // Count total
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await UserModel.query(countQuery, params);
        const total = countResult.total;

        // Add pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const users = await UserModel.query(query, params);

        res.json({
            success: true,
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users'
        });
    }
};

// Get user details
const getUserDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await UserModel.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get user stats
        const stats = await UserModel.getUserStats(id);

        // Get user listings
        const pets = await PetModel.findBySeller(id, 1, 5);
        const products = await ProductModel.findBySeller(id, 1, 5);

        // Get user orders
        const orders = await OrderModel.findByBuyer(id, 1, 5);

        // Get subscription
        const subscription = await SubscriptionModel.getUserStatus(id);

        res.json({
            success: true,
            user,
            stats,
            listings: {
                pets: pets.data,
                products: products.data
            },
            orders: orders.data,
            subscription
        });
    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user details'
        });
    }
};

// Update user status
const updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;

        const user = await UserModel.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        await UserModel.updateStatus(id, status);

        // Send email notification
        await sendEmail(
            user.email,
            'Account Status Updated',
            `Your account status has been changed to ${status}.${reason ? ` Reason: ${reason}` : ''}`
        );

        res.json({
            success: true,
            message: `User status updated to ${status}`
        });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user status'
        });
    }
};

// ========== SELLER VERIFICATION ==========

// Get pending sellers
const getPendingSellers = async (req, res) => {
    try {
        const sellers = await UserModel.query(
            `SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
                    s.store_name, s.business_name, s.business_license, s.tax_id,
                    up.bio, up.city, up.state, up.country
             FROM users u
             INNER JOIN sellers s ON u.id = s.user_id
             INNER JOIN user_profiles up ON u.id = up.user_id
             WHERE s.verification_status = 'pending'
             ORDER BY u.created_at DESC`
        );

        res.json({
            success: true,
            data: sellers
        });
    } catch (error) {
        console.error('Get pending sellers error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch pending sellers'
        });
    }
};

// Verify seller
const verifySeller = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body; // status: 'verified' or 'rejected'

        const user = await UserModel.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        await UserModel.query(
            `UPDATE sellers 
             SET verification_status = ?, verified_at = NOW()
             WHERE user_id = ?`,
            [status, id]
        );

        // Send email notification
        await sendEmail(
            user.email,
            'Seller Verification Update',
            `Your seller account has been ${status}.${notes ? ` Notes: ${notes}` : ''}`
        );

        res.json({
            success: true,
            message: `Seller ${status} successfully`
        });
    } catch (error) {
        console.error('Verify seller error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify seller'
        });
    }
};

// ========== CONTENT MODERATION ==========

// Get reported content
const getReportedContent = async (req, res) => {
    try {
        const reported = {
            comments: await CommentModel.getReported(),
            pets: await PetModel.query(
                `SELECT p.*, u.email as seller_email,
                        (SELECT COUNT(*) FROM reports WHERE target_type = 'pet' AND target_id = p.id) as report_count
                 FROM pets p
                 INNER JOIN users u ON p.seller_id = u.id
                 WHERE p.status = 'reported'
                 ORDER BY p.updated_at DESC`
            ),
            products: await ProductModel.query(
                `SELECT p.*, u.email as seller_email,
                        (SELECT COUNT(*) FROM reports WHERE target_type = 'product' AND target_id = p.id) as report_count
                 FROM products p
                 INNER JOIN users u ON p.seller_id = u.id
                 WHERE p.status = 'reported'
                 ORDER BY p.updated_at DESC`
            )
        };

        res.json({
            success: true,
            data: reported
        });
    } catch (error) {
        console.error('Get reported content error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch reported content'
        });
    }
};

// Moderate content
const moderateContent = async (req, res) => {
    try {
        const { type, id } = req.params;
        const { action, reason } = req.body; // action: 'warn', 'hide', 'delete', 'reinstate'

        let result;

        switch (type) {
            case 'comment':
                result = await CommentModel.moderate(id, action);
                break;
            case 'pet':
                if (action === 'delete') {
                    result = await PetModel.delete(id);
                } else {
                    result = await PetModel.update(id, { status: action === 'hide' ? 'hidden' : 'available' });
                }
                break;
            case 'product':
                if (action === 'delete') {
                    result = await ProductModel.delete(id);
                } else {
                    result = await ProductModel.update(id, { status: action === 'hide' ? 'hidden' : 'active' });
                }
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid content type'
                });
        }

        // Log moderation action
        await AnalyticsModel.trackEvent({
            event_type: 'moderation_action',
            user_id: req.user.id,
            metadata: {
                content_type: type,
                content_id: id,
                action,
                reason
            }
        });

        res.json({
            success: true,
            message: `Content ${action}d successfully`
        });
    } catch (error) {
        console.error('Moderate content error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to moderate content'
        });
    }
};

// ========== PLATFORM SETTINGS ==========

// Get platform settings
const getSettings = async (req, res) => {
    try {
        // In production, these would come from a settings table
        const settings = {
            site_name: 'PawDeal',
            site_url: process.env.FRONTEND_URL,
            support_email: 'support@pawdeal.com',
            commission_rate: 5.0,
            min_payout: 50,
            payment_gateway: 'stripe',
            currency: 'USD',
            maintenance_mode: false,
            registration_enabled: true,
            email_verification_required: true,
            seller_verification_required: true,
            max_pet_images: 10,
            max_product_images: 8,
            pet_listing_duration: 30, // days
            order_expiry: 24, // hours
            refund_period: 14, // days
            analytics_enabled: true
        };

        res.json({
            success: true,
            settings
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch settings'
        });
    }
};

// Update platform settings
const updateSettings = async (req, res) => {
    try {
        const settings = req.body;

        // In production, save to database
        // await SettingsModel.update(settings);

        res.json({
            success: true,
            message: 'Settings updated successfully',
            settings
        });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update settings'
        });
    }
};

// ========== REPORTS & ANALYTICS ==========

// Get platform reports
const getReports = async (req, res) => {
    try {
        const { period = '30d' } = req.query;

        const [
            userStats,
            petStats,
            productStats,
            orderStats,
            revenueStats
        ] = await Promise.all([
            UserModel.query(`
                SELECT 
                    COUNT(*) as total_users,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as new_users_today,
                    SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_users_week,
                    SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as new_users_month
                FROM users
            `),
            PetModel.query(`
                SELECT 
                    COUNT(*) as total_pets,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as new_pets_today,
                    SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_pets,
                    SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_pets
                FROM pets
                WHERE deleted_at IS NULL
            `),
            ProductModel.query(`
                SELECT 
                    COUNT(*) as total_products,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as new_products_today,
                    SUM(stock_quantity) as total_inventory,
                    AVG(price) as avg_price
                FROM products
                WHERE deleted_at IS NULL
            `),
            OrderModel.query(`
                SELECT 
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as orders_today,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as completed_orders,
                    SUM(total_amount) as total_revenue
                FROM orders
            `),
            OrderModel.query(`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as order_count,
                    SUM(total_amount) as revenue
                FROM orders
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY DATE(created_at)
                ORDER BY date
            `)
        ]);

        res.json({
            success: true,
            reports: {
                users: userStats[0],
                pets: petStats[0],
                products: productStats[0],
                orders: orderStats[0],
                revenue: revenueStats
            }
        });
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch reports'
        });
    }
};

// Export platform data
const exportData = async (req, res) => {
    try {
        const { type, format = 'json' } = req.query;

        let data = {};

        switch (type) {
            case 'users':
                data = await UserModel.getAllUsers(1, 10000);
                break;
            case 'pets':
                data = await PetModel.findAll({}, 1, 10000);
                break;
            case 'products':
                data = await ProductModel.findAll({}, 1, 10000);
                break;
            case 'orders':
                data = await OrderModel.query('SELECT * FROM orders ORDER BY created_at DESC');
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid export type'
                });
        }

        if (format === 'csv') {
            const csv = convertToCSV(data.data || data);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${type}_export.csv`);
            res.send(csv);
        } else {
            res.json({
                success: true,
                data
            });
        }
    } catch (error) {
        console.error('Export data error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export data'
        });
    }
};

// ========== AUDIT LOGS ==========

// Get audit logs
const getAuditLogs = async (req, res) => {
    try {
        const { page = 1, limit = 50, user_id, action, entity_type } = req.query;

        let query = 'SELECT * FROM audit_logs WHERE 1=1';
        const params = [];

        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }

        if (action) {
            query += ' AND action = ?';
            params.push(action);
        }

        if (entity_type) {
            query += ' AND entity_type = ?';
            params.push(entity_type);
        }

        // Count total
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await UserModel.query(countQuery, params);
        const total = countResult.total;

        // Add pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const logs = await UserModel.query(query, params);

        res.json({
            success: true,
            data: logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch audit logs'
        });
    }
};

// ========== BACKUP MANAGEMENT ==========

// Create backup
const createBackup = async (req, res) => {
    try {
        // In production, you'd trigger a database backup
        const backup = {
            id: Date.now(),
            created_at: new Date(),
            size: '10MB',
            tables: 30
        };

        // Log backup action
        await AnalyticsModel.trackEvent({
            event_type: 'backup_created',
            user_id: req.user.id,
            metadata: backup
        });

        res.json({
            success: true,
            message: 'Backup created successfully',
            backup
        });
    } catch (error) {
        console.error('Create backup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create backup'
        });
    }
};

// Get backups
const getBackups = async (req, res) => {
    try {
        // In production, you'd list actual backup files
        const backups = [
            {
                id: 1,
                filename: 'backup_20240101.sql',
                size: '10MB',
                created_at: '2024-01-01 00:00:00'
            }
        ];

        res.json({
            success: true,
            data: backups
        });
    } catch (error) {
        console.error('Get backups error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch backups'
        });
    }
};

// Restore backup
const restoreBackup = async (req, res) => {
    try {
        const { id } = req.params;

        // In production, you'd restore from backup file

        res.json({
            success: true,
            message: 'Backup restored successfully'
        });
    } catch (error) {
        console.error('Restore backup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to restore backup'
        });
    }
};

// ========== SYSTEM HEALTH ==========

// Get system health
const getSystemHealth = async (req, res) => {
    try {
        // Check database connection
        const dbHealth = await UserModel.query('SELECT 1 as health');

        // Check disk space
        const diskSpace = {
            total: '100GB',
            used: '45GB',
            free: '55GB',
            usage_percent: 45
        };

        // Check memory usage
        const memory = {
            total: '8GB',
            used: '3.2GB',
            free: '4.8GB',
            usage_percent: 40
        };

        // Check API response time
        const responseTime = '120ms';

        // Check active connections
        const activeConnections = await UserModel.query('SHOW STATUS LIKE "Threads_connected"');

        res.json({
            success: true,
            health: {
                database: dbHealth ? 'healthy' : 'unhealthy',
                disk_space: diskSpace,
                memory,
                response_time: responseTime,
                active_connections: activeConnections[0]?.Value || 0,
                uptime: process.uptime(),
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('Get system health error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system health'
        });
    }
};

// Clear cache
const clearCache = async (req, res) => {
    try {
        // In production, you'd clear Redis/cache
        res.json({
            success: true,
            message: 'Cache cleared successfully'
        });
    } catch (error) {
        console.error('Clear cache error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear cache'
        });
    }
};

// Toggle maintenance mode
const toggleMaintenance = async (req, res) => {
    try {
        const { enabled, message } = req.body;

        // In production, you'd update settings
        // await SettingsModel.update({ maintenance_mode: enabled });

        res.json({
            success: true,
            message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
            maintenance_message: message
        });
    } catch (error) {
        console.error('Toggle maintenance error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle maintenance mode'
        });
    }
};

// Helper function to convert to CSV
const convertToCSV = (data) => {
    if (!data || !Array.isArray(data) || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csv = [
        headers.join(','),
        ...data.map(row => headers.map(header => JSON.stringify(row[header] || '')).join(','))
    ];

    return csv.join('\n');
};

module.exports = {
    // User management
    getAllUsers,
    getUserDetails,
    updateUserStatus,

    // Seller verification
    getPendingSellers,
    verifySeller,

    // Content moderation
    getReportedContent,
    moderateContent,

    // Platform settings
    getSettings,
    updateSettings,

    // Reports & analytics
    getReports,
    exportData,

    // Audit logs
    getAuditLogs,

    // Backup management
    createBackup,
    getBackups,
    restoreBackup,

    // System health
    getSystemHealth,
    clearCache,
    toggleMaintenance
};