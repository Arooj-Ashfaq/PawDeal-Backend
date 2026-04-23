// src/models/favoriteModel.js
const DB = require('./db');

class FavoriteModel extends DB {
    // Add item to favorites
    static async add(userId, itemType, itemId) {
        // Check if already favorited
        const existing = await this.getOne(
            'SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?',
            [userId, itemType, itemId]
        );

        if (existing) {
            return false; // Already favorited
        }

        await this.query(
            'INSERT INTO favorites (user_id, item_type, item_id, created_at) VALUES (?, ?, ?, NOW())',
            [userId, itemType, itemId]
        );

        // Update favorite count on the item
        if (itemType === 'pet') {
            await this.query(
                'UPDATE pets SET favorite_count = favorite_count + 1 WHERE id = ?',
                [itemId]
            );
        } else if (itemType === 'product') {
            // Could add favorite_count to products table if needed
        }

        return true;
    }

    // Remove item from favorites
    static async remove(userId, itemType, itemId) {
        await this.query(
            'DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?',
            [userId, itemType, itemId]
        );

        // Update favorite count on the item
        if (itemType === 'pet') {
            await this.query(
                'UPDATE pets SET favorite_count = GREATEST(0, favorite_count - 1) WHERE id = ?',
                [itemId]
            );
        }

        return true;
    }

    // Check if item is favorited by user
    static async isFavorited(userId, itemType, itemId) {
        const favorite = await this.getOne(
            'SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?',
            [userId, itemType, itemId]
        );
        return !!favorite;
    }

    // Get user's favorite pets
    static async getUserPets(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const pets = await this.query(
            `SELECT p.*, 
                    f.created_at as favorited_at,
                    (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1) as primary_image,
                    u.first_name as seller_name
             FROM favorites f
             INNER JOIN pets p ON f.item_id = p.id
             LEFT JOIN users u ON p.seller_id = u.id
             WHERE f.user_id = ? AND f.item_type = 'pet'
             ORDER BY f.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        const [total] = await this.query(
            'SELECT COUNT(*) as count FROM favorites WHERE user_id = ? AND item_type = "pet"',
            [userId]
        );

        return {
            data: pets,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Get user's favorite products
    static async getUserProducts(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const products = await this.query(
            `SELECT p.*,
                    f.created_at as favorited_at,
                    (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image,
                    u.first_name as seller_name
             FROM favorites f
             INNER JOIN products p ON f.item_id = p.id
             LEFT JOIN users u ON p.seller_id = u.id
             WHERE f.user_id = ? AND f.item_type = 'product'
             ORDER BY f.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        const [total] = await this.query(
            'SELECT COUNT(*) as count FROM favorites WHERE user_id = ? AND item_type = "product"',
            [userId]
        );

        return {
            data: products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Get all user favorites (both pets and products)
    static async getAllUserFavorites(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const favorites = await this.query(
            `SELECT 
                f.*,
                CASE 
                    WHEN f.item_type = 'pet' THEN p.name
                    WHEN f.item_type = 'product' THEN pr.name
                END as item_name,
                CASE 
                    WHEN f.item_type = 'pet' THEN p.price
                    WHEN f.item_type = 'product' THEN pr.price
                END as price,
                CASE 
                    WHEN f.item_type = 'pet' THEN (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1)
                    WHEN f.item_type = 'product' THEN (SELECT image_url FROM product_images WHERE product_id = pr.id AND is_primary = 1 LIMIT 1)
                END as image
             FROM favorites f
             LEFT JOIN pets p ON f.item_type = 'pet' AND f.item_id = p.id
             LEFT JOIN products pr ON f.item_type = 'product' AND f.item_id = pr.id
             WHERE f.user_id = ?
             ORDER BY f.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        const [total] = await this.query(
            'SELECT COUNT(*) as count FROM favorites WHERE user_id = ?',
            [userId]
        );

        return {
            data: favorites,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Get favorite counts for user
    static async getCounts(userId) {
        const [result] = await this.query(
            `SELECT 
                SUM(CASE WHEN item_type = 'pet' THEN 1 ELSE 0 END) as pet_count,
                SUM(CASE WHEN item_type = 'product' THEN 1 ELSE 0 END) as product_count,
                COUNT(*) as total_count
             FROM favorites
             WHERE user_id = ?`,
            [userId]
        );

        return {
            pets: result.pet_count || 0,
            products: result.product_count || 0,
            total: result.total_count || 0
        };
    }

    // Get most favorited pets
    static async getMostFavoritedPets(limit = 10) {
        return await this.query(
            `SELECT p.*, 
                    COUNT(f.id) as favorite_count,
                    (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
             FROM pets p
             INNER JOIN favorites f ON p.id = f.item_id AND f.item_type = 'pet'
             WHERE p.status = 'available'
             GROUP BY p.id
             ORDER BY favorite_count DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Get favorite suggestions based on user's favorites
    static async getSuggestions(userId, limit = 10) {
        // Get user's favorite categories/breeds
        const userPrefs = await this.query(
            `SELECT 
                p.category,
                p.breed_id,
                COUNT(*) as pref_score
             FROM favorites f
             INNER JOIN pets p ON f.item_id = p.id
             WHERE f.user_id = ? AND f.item_type = 'pet'
             GROUP BY p.category, p.breed_id
             ORDER BY pref_score DESC
             LIMIT 5`,
            [userId]
        );

        if (userPrefs.length === 0) {
            return []; // No preferences yet
        }

        // Build query based on preferences
        let sql = `
            SELECT p.*, 
                   (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
            FROM pets p
            WHERE p.status = 'available'
            AND p.id NOT IN (
                SELECT item_id FROM favorites WHERE user_id = ? AND item_type = 'pet'
            )
            AND (
        `;
        const params = [userId];
        const conditions = [];

        userPrefs.forEach(pref => {
            if (pref.breed_id) {
                conditions.push('p.breed_id = ?');
                params.push(pref.breed_id);
            } else {
                conditions.push('p.category = ?');
                params.push(pref.category);
            }
        });

        sql += conditions.join(' OR ') + ') ORDER BY p.created_at DESC LIMIT ?';
        params.push(limit);

        return await this.query(sql, params);
    }

    // Bulk add favorites (for migration/import)
    static async bulkAdd(userId, items) {
        const results = {
            added: 0,
            skipped: 0,
            errors: []
        };

        for (const item of items) {
            try {
                const added = await this.add(userId, item.type, item.id);
                if (added) {
                    results.added++;
                } else {
                    results.skipped++;
                }
            } catch (error) {
                results.errors.push({
                    item,
                    error: error.message
                });
            }
        }

        return results;
    }

    // Clear all favorites for user
    static async clearAll(userId) {
        // Update favorite counts for pets
        const petFavs = await this.query(
            'SELECT item_id FROM favorites WHERE user_id = ? AND item_type = "pet"',
            [userId]
        );

        for (const fav of petFavs) {
            await this.query(
                'UPDATE pets SET favorite_count = GREATEST(0, favorite_count - 1) WHERE id = ?',
                [fav.item_id]
            );
        }

        await this.query('DELETE FROM favorites WHERE user_id = ?', [userId]);

        return petFavs.length;
    }

    // Get mutual favorites (users who favorited same items)
    static async getMutualFavorites(userId, itemType, itemId) {
        return await this.query(
            `SELECT u.id, u.first_name, u.last_name, u.email
             FROM favorites f
             INNER JOIN users u ON f.user_id = u.id
             WHERE f.item_type = ? 
               AND f.item_id = ?
               AND f.user_id != ?
             LIMIT 10`,
            [itemType, itemId, userId]
        );
    }

    // Get favorite stats for admin
    static async getStats() {
        const stats = await this.getOne(
            `SELECT 
                COUNT(*) as total_favorites,
                COUNT(DISTINCT user_id) as unique_users,
                SUM(CASE WHEN item_type = 'pet' THEN 1 ELSE 0 END) as pet_favorites,
                SUM(CASE WHEN item_type = 'product' THEN 1 ELSE 0 END) as product_favorites
             FROM favorites`
        );

        // Most favorited pets
        stats.top_pets = await this.query(
            `SELECT p.name, COUNT(*) as fav_count
             FROM favorites f
             INNER JOIN pets p ON f.item_id = p.id
             WHERE f.item_type = 'pet'
             GROUP BY p.id
             ORDER BY fav_count DESC
             LIMIT 5`
        );

        return stats;
    }

    // Export user favorites (for GDPR compliance)
    static async exportUserData(userId) {
        const favorites = await this.query(
            `SELECT 
                item_type,
                item_id,
                created_at
             FROM favorites
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        return {
            user_id: userId,
            export_date: new Date().toISOString(),
            total_count: favorites.length,
            favorites
        };
    }
}

module.exports = FavoriteModel;