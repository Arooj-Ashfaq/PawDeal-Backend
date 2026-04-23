// src/controllers/userController.js
const UserModel = require('../models/userModel');
const PetModel = require('../models/petModel');
const ProductModel = require('../models/productModel');
const OrderModel = require('../models/orderModel');
const FavoriteModel = require('../models/favoriteModel');
const { uploadSingle, deleteFile } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// Get user profile
const getProfile = async (req, res) => {
    try {
        const userId = req.params.id || req.user.id;
        
        const user = await UserModel.findById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get user stats
        const stats = await UserModel.getUserStats(userId);
        
        // Check if current user is viewing their own profile
        const isOwnProfile = req.user && req.user.id === userId;

        // Remove sensitive data if not own profile
        if (!isOwnProfile) {
            delete user.email;
            delete user.phone;
            delete user.address_line1;
            delete user.postal_code;
        }

        res.json({
            success: true,
            user: {
                ...user,
                stats
            },
            is_own_profile: isOwnProfile
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user profile'
        });
    }
};

// Update profile
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            first_name, last_name, phone, bio,
            city, state, country, address_line1,
            address_line2, postal_code
        } = req.body;

        await UserModel.updateProfile(userId, {
            first_name, last_name, phone, bio,
            city, state, country, address_line1,
            address_line2, postal_code
        });

        // Get updated user
        const updatedUser = await UserModel.findById(userId);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile'
        });
    }
};

// Upload profile image
const uploadProfileImage = async (req, res) => {
    try {
        const userId = req.user.id;

        // Use multer upload middleware
        uploadSingle('image')(req, res, async (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No image file provided'
                });
            }

            // Get old user to delete old image
            const oldUser = await UserModel.findById(userId);
            
            // Save new image path
            const imageUrl = `/uploads/users/${req.file.filename}`;
            await UserModel.updateProfileImage(userId, imageUrl);

            // Delete old image if exists
            if (oldUser && oldUser.profile_image_url) {
                const oldPath = path.join(__dirname, '../../', oldUser.profile_image_url);
                deleteFile(oldPath);
            }

            res.json({
                success: true,
                message: 'Profile image uploaded successfully',
                image_url: imageUrl
            });
        });
    } catch (error) {
        console.error('Upload profile image error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload profile image'
        });
    }
};

// Become a seller
const becomeSeller = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            store_name, store_description,
            business_name, business_license, tax_id
        } = req.body;

        // Check if already a seller
        const isSeller = await UserModel.isSeller(userId);
        if (isSeller) {
            return res.status(400).json({
                success: false,
                error: 'You are already a seller'
            });
        }

        await UserModel.becomeSeller(userId, {
            store_name,
            store_description,
            business_name,
            business_license,
            tax_id
        });

        res.json({
            success: true,
            message: 'Seller application submitted successfully. Pending verification.'
        });
    } catch (error) {
        console.error('Become seller error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit seller application'
        });
    }
};

// Get user listings (pets and products)
const getUserListings = async (req, res) => {
    try {
        const userId = req.params.id || req.user.id;
        const { page = 1, limit = 20, type = 'all' } = req.query;

        let pets = [];
        let products = [];
        let pagination = {};

        if (type === 'all' || type === 'pets') {
            const petResult = await PetModel.findBySeller(userId, page, limit);
            pets = petResult.data;
            pagination = petResult.pagination;
        }

        if (type === 'all' || type === 'products') {
            const productResult = await ProductModel.findBySeller(userId, page, limit);
            products = productResult.data;
            pagination = productResult.pagination;
        }

        res.json({
            success: true,
            data: {
                pets,
                products
            },
            pagination
        });
    } catch (error) {
        console.error('Get user listings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user listings'
        });
    }
};

// Get user orders (as buyer)
const getUserOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        const orders = await OrderModel.findByBuyer(userId, page, limit);

        res.json({
            success: true,
            ...orders
        });
    } catch (error) {
        console.error('Get user orders error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get orders'
        });
    }
};

// Get user sales (as seller)
const getUserSales = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        // Check if user is seller
        const isSeller = await UserModel.isSeller(userId);
        if (!isSeller) {
            return res.status(403).json({
                success: false,
                error: 'You are not a seller'
            });
        }

        const sales = await OrderModel.findBySeller(userId, page, limit);

        res.json({
            success: true,
            ...sales
        });
    } catch (error) {
        console.error('Get user sales error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sales'
        });
    }
};

// Get user favorites
const getUserFavorites = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, type = 'all' } = req.query;

        let result;

        if (type === 'pets') {
            result = await FavoriteModel.getUserPets(userId, page, limit);
        } else if (type === 'products') {
            result = await FavoriteModel.getUserProducts(userId, page, limit);
        } else {
            result = await FavoriteModel.getAllUserFavorites(userId, page, limit);
        }

        // Get counts
        const counts = await FavoriteModel.getCounts(userId);

        res.json({
            success: true,
            data: result.data,
            pagination: result.pagination,
            counts
        });
    } catch (error) {
        console.error('Get user favorites error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get favorites'
        });
    }
};

// Add to favorites
const addFavorite = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, id } = req.params;

        if (!['pet', 'product'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid favorite type'
            });
        }

        const added = await FavoriteModel.add(userId, type, id);

        if (added) {
            res.json({
                success: true,
                message: 'Added to favorites'
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Already in favorites'
            });
        }
    } catch (error) {
        console.error('Add favorite error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add to favorites'
        });
    }
};

// Remove from favorites
const removeFavorite = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, id } = req.params;

        await FavoriteModel.remove(userId, type, id);

        res.json({
            success: true,
            message: 'Removed from favorites'
        });
    } catch (error) {
        console.error('Remove favorite error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove from favorites'
        });
    }
};

// Check if item is favorited
const checkFavorite = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, id } = req.params;

        const isFavorited = await FavoriteModel.isFavorited(userId, type, id);

        res.json({
            success: true,
            is_favorited: isFavorited
        });
    } catch (error) {
        console.error('Check favorite error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check favorite status'
        });
    }
};

// Get user notifications
const getUserNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        // Get unread message count
        const unreadMessages = await require('../models/messageModel').getUnreadCount(userId);

        // Get recent orders (as buyer)
        const recentOrders = await OrderModel.findByBuyer(userId, 1, 5);

        // Get recent sales (as seller)
        const isSeller = await UserModel.isSeller(userId);
        let recentSales = { data: [] };
        if (isSeller) {
            recentSales = await OrderModel.findBySeller(userId, 1, 5);
        }

        // Get favorite updates (e.g., price changes)
        const favorites = await FavoriteModel.getAllUserFavorites(userId, 1, 10);

        res.json({
            success: true,
            notifications: {
                unread_messages: unreadMessages,
                recent_orders: recentOrders.data,
                recent_sales: recentSales.data,
                // You could add more notification types
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get notifications'
        });
    }
};

// Update notification preferences
const updateNotificationPrefs = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            email_notifications,
            push_notifications,
            message_notifications,
            order_notifications,
            promotion_notifications
        } = req.body;

        const preferences = {
            email: email_notifications !== false,
            push: push_notifications !== false,
            messages: message_notifications !== false,
            orders: order_notifications !== false,
            promotions: promotion_notifications !== false
        };

        await UserModel.query(
            `UPDATE user_profiles 
             SET notification_preferences = ?
             WHERE user_id = ?`,
            [JSON.stringify(preferences), userId]
        );

        res.json({
            success: true,
            message: 'Notification preferences updated'
        });
    } catch (error) {
        console.error('Update notification prefs error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update preferences'
        });
    }
};

// Get user's selling dashboard
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

        // Get seller stats
        const petStats = await PetModel.getSellerStats(userId);
        const productStats = await ProductModel.getSellerStats(userId);
        
        // Get recent orders
        const recentOrders = await OrderModel.findBySeller(userId, 1, 5);

        // Get low stock products
        const lowStock = await ProductModel.getLowStock(userId);

        // Get analytics (simplified)
        const analytics = {
            total_views: (petStats?.total_views || 0) + (productStats?.total_views || 0),
            total_favorites: petStats?.total_favorites || 0,
            conversion_rate: 0 // Calculate based on views vs sales
        };

        res.json({
            success: true,
            dashboard: {
                pet_stats: petStats,
                product_stats: productStats,
                recent_orders: recentOrders.data,
                low_stock: lowStock,
                analytics
            }
        });
    } catch (error) {
        console.error('Get seller dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get seller dashboard'
        });
    }
};

// Get user's buying dashboard
const getBuyerDashboard = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get recent orders
        const recentOrders = await OrderModel.findByBuyer(userId, 1, 5);

        // Get favorites count
        const favoritesCount = await FavoriteModel.getCounts(userId);

        // Get saved searches (you'd need a saved_searches table for this)
        const savedSearches = [];

        // Get recommended pets based on order history
        let recommendedPets = [];
        if (recentOrders.data.length > 0) {
            // Simple recommendation based on recent purchases
            const lastOrder = recentOrders.data[0];
            // You'd implement recommendation logic here
        }

        res.json({
            success: true,
            dashboard: {
                recent_orders: recentOrders.data,
                favorites: favoritesCount,
                saved_searches: savedSearches,
                recommended_pets: recommendedPets
            }
        });
    } catch (error) {
        console.error('Get buyer dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get buyer dashboard'
        });
    }
};

// Delete account (GDPR compliance)
const deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id;
        const { password } = req.body;

        // Verify password
        const user = await UserModel.findByEmail(req.user.email);
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid password'
            });
        }

        // Soft delete user (or actual delete based on requirements)
        await UserModel.query(
            'UPDATE users SET account_status = "deleted", email = CONCAT(email, ".deleted"), updated_at = NOW() WHERE id = ?',
            [userId]
        );

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete account'
        });
    }
};

// Export user data (GDPR compliance)
const exportUserData = async (req, res) => {
    try {
        const userId = req.user.id;

        // Gather all user data
        const user = await UserModel.findById(userId);
        const orders = await OrderModel.findByBuyer(userId, 1, 1000);
        const favorites = await FavoriteModel.getAllUserFavorites(userId, 1, 1000);
        const pets = await PetModel.findBySeller(userId, 1, 1000);
        const products = await ProductModel.findBySeller(userId, 1, 1000);
        const messages = await require('../models/messageModel').query(
            `SELECT * FROM messages WHERE sender_id = ? OR receiver_id = ? ORDER BY created_at DESC`,
            [userId, userId]
        );
        const comments = await require('../models/commentModel').query(
            'SELECT * FROM comments WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );

        const userData = {
            profile: user,
            orders: orders.data,
            favorites: favorites.data,
            listings: {
                pets: pets.data,
                products: products.data
            },
            messages: messages,
            comments: comments,
            export_date: new Date().toISOString()
        };

        // Generate JSON file
        const fileName = `user-data-${userId}-${Date.now()}.json`;
        const filePath = path.join(__dirname, '../../exports', fileName);

        // Ensure exports directory exists
        if (!fs.existsSync(path.join(__dirname, '../../exports'))) {
            fs.mkdirSync(path.join(__dirname, '../../exports'));
        }

        fs.writeFileSync(filePath, JSON.stringify(userData, null, 2));

        res.download(filePath, fileName, (err) => {
            if (err) {
                console.error('Download error:', err);
            }
            // Clean up file after download
            fs.unlinkSync(filePath);
        });
    } catch (error) {
        console.error('Export user data error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export user data'
        });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    uploadProfileImage,
    becomeSeller,
    getUserListings,
    getUserOrders,
    getUserSales,
    getUserFavorites,
    addFavorite,
    removeFavorite,
    checkFavorite,
    getUserNotifications,
    updateNotificationPrefs,
    getSellerDashboard,
    getBuyerDashboard,
    deleteAccount,
    exportUserData
};