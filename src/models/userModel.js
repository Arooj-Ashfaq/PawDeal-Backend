// src/models/userModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class UserModel extends DB {
    // Create new user
    static async create(userData) {
        const {
            email, password_hash, first_name, last_name,
            phone, role = 'user', account_status = 'active',
            email_verified = true, profile_image_url = null
        } = userData;

        const id = uuidv4();

        await this.query(
            `INSERT INTO users (
                id, email, password_hash, first_name, last_name,
                phone, role, account_status, email_verified,
                profile_image_url, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [id, email, password_hash, first_name, last_name,
             phone, role, account_status, email_verified, profile_image_url]
        );

        // Create user profile
        await this.query(
            `INSERT INTO user_profiles (user_id, is_seller) VALUES (?, ?)`,
            [id, false]
        );

        return id;
    }

    // Find user by email
    static async findByEmail(email) {
        return await this.getOne(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
    }

    // Find user by ID
    static async findById(id) {
        return await this.getOne(
            `SELECT u.*, up.bio, up.city, up.state, up.country,
                    up.address_line1, up.postal_code, up.is_seller,
                    s.store_name, s.seller_rating, s.verification_status
             FROM users u
             LEFT JOIN user_profiles up ON u.id = up.user_id
             LEFT JOIN sellers s ON u.id = s.user_id
             WHERE u.id = ?`,
            [id]
        );
    }

    // Update user profile
    static async updateProfile(userId, profileData) {
        const {
            first_name, last_name, phone, bio,
            city, state, country, address_line1,
            address_line2, postal_code
        } = profileData;

        // Update users table
        if (first_name || last_name || phone) {
            await this.query(
                `UPDATE users
                 SET first_name = COALESCE(?, first_name),
                     last_name = COALESCE(?, last_name),
                     phone = COALESCE(?, phone),
                     updated_at = NOW()
                 WHERE id = ?`,
                [first_name, last_name, phone, userId]
            );
        }

        // Update user_profiles table
        await this.query(
            `UPDATE user_profiles
             SET bio = COALESCE(?, bio),
                 city = COALESCE(?, city),
                 state = COALESCE(?, state),
                 country = COALESCE(?, country),
                 address_line1 = COALESCE(?, address_line1),
                 address_line2 = COALESCE(?, address_line2),
                 postal_code = COALESCE(?, postal_code)
             WHERE user_id = ?`,
            [bio, city, state, country, address_line1, address_line2, postal_code, userId]
        );

        return true;
    }

    // Update last login
    static async updateLastLogin(userId) {
        await this.query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [userId]
        );
    }

    // Verify email
    static async verifyEmail(token) {
        const user = await this.getOne(
            'SELECT id FROM users WHERE email_verification_token = ?',
            [token]
        );

        if (user) {
            await this.query(
                `UPDATE users
                 SET email_verified = true,
                     email_verification_token = NULL,
                     account_status = 'active',
                     updated_at = NOW()
                 WHERE id = ?`,
                [user.id]
            );
            return true;
        }
        return false;
    }

    // Set reset password token
    static async setResetToken(email, token, expires) {
        await this.query(
            `UPDATE users
             SET reset_password_token = ?,
                 reset_password_expires = ?
             WHERE email = ?`,
            [token, expires, email]
        );
    }

    // Reset password
    static async resetPassword(token, newPassword) {
        const user = await this.getOne(
            `SELECT id FROM users
             WHERE reset_password_token = ?
             AND reset_password_expires > NOW()`,
            [token]
        );

        if (user) {
            await this.query(
                `UPDATE users
                 SET password_hash = ?,
                     reset_password_token = NULL,
                     reset_password_expires = NULL,
                     updated_at = NOW()
                 WHERE id = ?`,
                [newPassword, user.id]
            );
            return true;
        }
        return false;
    }

    // Update password
    static async updatePassword(userId, newPassword) {
        await this.query(
            'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
            [newPassword, userId]
        );
    }

    // Update profile image
    static async updateProfileImage(userId, imageUrl) {
        await this.query(
            'UPDATE users SET profile_image_url = ?, updated_at = NOW() WHERE id = ?',
            [imageUrl, userId]
        );
    }

    // Get user stats (for dashboard)
    static async getUserStats(userId) {
        const stats = {};

        // Get pet counts
        const [petStats] = await this.query(
            `SELECT
                COUNT(*) as total_pets,
                SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_pets,
                SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_pets
             FROM pets WHERE seller_id = ?`,
            [userId]
        );
        stats.pets = petStats;

        // Get product stats
        const [productStats] = await this.query(
            `SELECT
                COUNT(*) as total_products,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_products
             FROM products WHERE seller_id = ?`,
            [userId]
        );
        stats.products = productStats;

        // Get order stats (as buyer)
        const [buyerStats] = await this.query(
            `SELECT
                COUNT(*) as total_orders,
                SUM(total_amount) as total_spent
             FROM orders WHERE buyer_id = ?`,
            [userId]
        );
        stats.orders = buyerStats;

        // Get favorite count
        const [favoriteCount] = await this.query(
            'SELECT COUNT(*) as count FROM favorites WHERE user_id = ?',
            [userId]
        );
        stats.favorites = favoriteCount.count;

        return stats;
    }

    // Get all users (admin)
    static async getAllUsers(page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const users = await this.query(
            `SELECT id, email, first_name, last_name, role,
                    account_status, email_verified, created_at, last_login
             FROM users
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const [total] = await this.query('SELECT COUNT(*) as count FROM users');

        return {
            users,
            pagination: {
                page,
                limit,
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Update user status (admin)
    static async updateStatus(userId, status) {
        await this.query(
            'UPDATE users SET account_status = ?, updated_at = NOW() WHERE id = ?',
            [status, userId]
        );
    }

    // Become seller
    static async becomeSeller(userId, sellerData) {
        const {
            store_name, store_description, business_name,
            business_license, tax_id
        } = sellerData;

        // Update user_profiles
        await this.query(
            `UPDATE user_profiles
             SET is_seller = true,
                 seller_since = NOW(),
                 business_name = ?,
                 business_license = ?,
                 tax_id = ?
             WHERE user_id = ?`,
            [business_name, business_license, tax_id, userId]
        );

        // Insert into sellers table
        await this.query(
            `INSERT INTO sellers (
                user_id, store_name, store_description,
                verification_status, created_at
            ) VALUES (?, ?, ?, 'pending', NOW())`,
            [userId, store_name, store_description]
        );

        return true;
    }

    // Check if user is seller
    static async isSeller(userId) {
        const profile = await this.getOne(
            'SELECT is_seller FROM user_profiles WHERE user_id = ?',
            [userId]
        );
        return profile ? profile.is_seller : false;
    }
}

module.exports = UserModel;