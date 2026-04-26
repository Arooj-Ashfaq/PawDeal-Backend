// src/models/favoriteModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class FavoriteModel extends DB {
    // Get user's favorite pets with full details
    static async getUserPets(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        
        const query = `
            SELECT 
                p.id,
                p.name,
                p.price,
                p.category,
                p.breed,
                p.gender,
                p.age_years,
                p.age_months,
                p.primary_image,
                p.status,
                p.vaccinated,
                p.city,
                p.description,
                f.created_at as favorited_at
            FROM favorites f
            JOIN pets p ON f.pet_id = p.id
            WHERE f.user_id = ? AND f.item_type = 'pet'
            ORDER BY f.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const pets = await this.query(query, [userId, parseInt(limit), parseInt(offset)]);
        
        const [countResult] = await this.query(
            'SELECT COUNT(*) as total FROM favorites WHERE user_id = ? AND item_type = "pet"',
            [userId]
        );
        
        return {
            data: pets,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult.total,
                pages: Math.ceil(countResult.total / limit)
            }
        };
    }

    // Get user's favorite products
    static async getUserProducts(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        
        const query = `
            SELECT 
                pr.*,
                f.created_at as favorited_at
            FROM favorites f
            JOIN products pr ON f.product_id = pr.id
            WHERE f.user_id = ? AND f.item_type = 'product'
            ORDER BY f.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const products = await this.query(query, [userId, parseInt(limit), parseInt(offset)]);
        
        const [countResult] = await this.query(
            'SELECT COUNT(*) as total FROM favorites WHERE user_id = ? AND item_type = "product"',
            [userId]
        );
        
        return {
            data: products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult.total,
                pages: Math.ceil(countResult.total / limit)
            }
        };
    }

    // Get all user favorites (both pets and products)
    static async getAllUserFavorites(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        
        // Get favorite pets
        const petsQuery = `
            SELECT 
                p.id,
                p.name,
                p.price,
                p.category,
                p.breed,
                p.gender,
                p.age_years,
                p.age_months,
                p.primary_image,
                p.status,
                p.vaccinated,
                p.city,
                p.description,
                'pet' as item_type,
                f.created_at as favorited_at
            FROM favorites f
            JOIN pets p ON f.pet_id = p.id
            WHERE f.user_id = ? AND f.item_type = 'pet'
        `;
        
        const pets = await this.query(petsQuery, [userId]);
        
        // Get favorite products
        const productsQuery = `
            SELECT 
                pr.id,
                pr.name,
                pr.price,
                pr.category,
                pr.description,
                pr.primary_image,
                'product' as item_type,
                f.created_at as favorited_at
            FROM favorites f
            JOIN products pr ON f.product_id = pr.id
            WHERE f.user_id = ? AND f.item_type = 'product'
        `;
        
        const products = await this.query(productsQuery, [userId]);
        
        // Combine and sort by favorited date
        let allFavorites = [...pets, ...products];
        allFavorites.sort((a, b) => new Date(b.favorited_at) - new Date(a.favorited_at));
        
        const total = allFavorites.length;
        const paginatedData = allFavorites.slice(offset, offset + parseInt(limit));
        
        return {
            data: paginatedData,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    // Add item to favorites
    static async add(userId, type, itemId) {
        const id = uuidv4();
        
        try {
            if (type === 'pet') {
                await this.query(
                    `INSERT INTO favorites (id, user_id, pet_id, item_type, created_at)
                     VALUES (?, ?, ?, 'pet', NOW())`,
                    [id, userId, itemId]
                );
            } else {
                await this.query(
                    `INSERT INTO favorites (id, user_id, product_id, item_type, created_at)
                     VALUES (?, ?, ?, 'product', NOW())`,
                    [id, userId, itemId]
                );
            }
            return true;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return false;
            }
            throw error;
        }
    }

    // Remove item from favorites
    static async remove(userId, type, itemId) {
        if (type === 'pet') {
            await this.query(
                'DELETE FROM favorites WHERE user_id = ? AND pet_id = ? AND item_type = "pet"',
                [userId, itemId]
            );
        } else {
            await this.query(
                'DELETE FROM favorites WHERE user_id = ? AND product_id = ? AND item_type = "product"',
                [userId, itemId]
            );
        }
        return true;
    }

    // Check if item is favorited
    static async isFavorited(userId, type, itemId) {
        let result;
        if (type === 'pet') {
            result = await this.getOne(
                'SELECT id FROM favorites WHERE user_id = ? AND pet_id = ? AND item_type = "pet"',
                [userId, itemId]
            );
        } else {
            result = await this.getOne(
                'SELECT id FROM favorites WHERE user_id = ? AND product_id = ? AND item_type = "product"',
                [userId, itemId]
            );
        }
        return !!result;
    }

    // Get favorite counts
    static async getCounts(userId) {
        const [petCount] = await this.query(
            'SELECT COUNT(*) as count FROM favorites WHERE user_id = ? AND item_type = "pet"',
            [userId]
        );
        
        const [productCount] = await this.query(
            'SELECT COUNT(*) as count FROM favorites WHERE user_id = ? AND item_type = "product"',
            [userId]
        );
        
        return {
            pets: petCount.count,
            products: productCount.count,
            total: petCount.count + productCount.count
        };
    }

    // Clear all user favorites
    static async clearAll(userId) {
        const result = await this.query(
            'DELETE FROM favorites WHERE user_id = ?',
            [userId]
        );
        return result.affectedRows;
    }

    // Get favorite suggestions based on user's favorites
    static async getSuggestions(userId, limit = 10) {
        // Get categories from user's favorite pets
        const categories = await this.query(
            `SELECT DISTINCT p.category
             FROM favorites f
             JOIN pets p ON f.pet_id = p.id
             WHERE f.user_id = ? AND f.item_type = 'pet'
             LIMIT 5`,
            [userId]
        );
        
        if (categories.length === 0) {
            return [];
        }
        
        const categoryList = categories.map(c => `'${c.category}'`).join(',');
        
        const suggestions = await this.query(
            `SELECT 
                p.id,
                p.name,
                p.price,
                p.category,
                p.primary_image,
                COUNT(f.id) as favorite_count
             FROM pets p
             LEFT JOIN favorites f ON p.id = f.pet_id
             WHERE p.category IN (${categoryList})
               AND p.id NOT IN (
                   SELECT pet_id FROM favorites WHERE user_id = ? AND item_type = 'pet'
               )
             GROUP BY p.id
             ORDER BY favorite_count DESC
             LIMIT ?`,
            [userId, parseInt(limit)]
        );
        
        return suggestions;
    }

    // Get most favorited pets (public)
    static async getMostFavoritedPets(limit = 10) {
        const pets = await this.query(
            `SELECT 
                p.id,
                p.name,
                p.price,
                p.category,
                p.breed,
                p.primary_image,
                COUNT(f.id) as favorite_count
             FROM pets p
             LEFT JOIN favorites f ON p.id = f.pet_id AND f.item_type = 'pet'
             WHERE p.status = 'available'
             GROUP BY p.id
             ORDER BY favorite_count DESC
             LIMIT ?`,
            [parseInt(limit)]
        );
        
        return pets;
    }

    // Bulk add favorites
    static async bulkAdd(userId, items) {
        let added = 0;
        let skipped = 0;
        
        for (const item of items) {
            try {
                const id = uuidv4();
                if (item.type === 'pet') {
                    await this.query(
                        `INSERT IGNORE INTO favorites (id, user_id, pet_id, item_type, created_at)
                         VALUES (?, ?, ?, 'pet', NOW())`,
                        [id, userId, item.id]
                    );
                } else {
                    await this.query(
                        `INSERT IGNORE INTO favorites (id, user_id, product_id, item_type, created_at)
                         VALUES (?, ?, ?, 'product', NOW())`,
                        [id, userId, item.id]
                    );
                }
                added++;
            } catch (error) {
                skipped++;
            }
        }
        
        return { added, skipped };
    }

    // Export user favorites data (for GDPR)
    static async exportUserData(userId) {
        const favorites = await this.query(
            `SELECT 
                f.id,
                f.item_type,
                f.created_at,
                CASE 
                    WHEN f.item_type = 'pet' THEN p.name
                    WHEN f.item_type = 'product' THEN pr.name
                END as item_name,
                CASE 
                    WHEN f.item_type = 'pet' THEN p.price
                    WHEN f.item_type = 'product' THEN pr.price
                END as item_price
             FROM favorites f
             LEFT JOIN pets p ON f.pet_id = p.id
             LEFT JOIN products pr ON f.product_id = pr.id
             WHERE f.user_id = ?`,
            [userId]
        );
        
        return {
            user_id: userId,
            export_date: new Date().toISOString(),
            total_favorites: favorites.length,
            favorites: favorites
        };
    }
}

module.exports = FavoriteModel;