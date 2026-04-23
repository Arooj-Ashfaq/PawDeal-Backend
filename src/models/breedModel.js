// src/models/breedModel.js
const DB = require('./db');

class BreedModel extends DB {
    // Create new breed
    static async create(breedData) {
        const {
            name, category, description, temperament,
            care_requirements, health_considerations,
            average_size, average_weight, life_expectancy,
            image_url, popular = false
        } = breedData;

        const [result] = await this.query(
            `INSERT INTO breeds (
                name, category, description, temperament,
                care_requirements, health_considerations,
                average_size, average_weight, life_expectancy,
                image_url, popular
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, category, description, temperament,
             care_requirements, health_considerations,
             average_size, average_weight, life_expectancy,
             image_url, popular]
        );

        return result.insertId;
    }

    // Find breed by ID
    static async findById(id) {
        return await this.getOne(
            'SELECT * FROM breeds WHERE id = ?',
            [id]
        );
    }

    // Find breed by name
    static async findByName(name) {
        return await this.getOne(
            'SELECT * FROM breeds WHERE name = ?',
            [name]
        );
    }

    // Get all breeds with filters
    static async findAll(filters = {}, page = 1, limit = 50) {
        let sql = 'SELECT * FROM breeds WHERE 1=1';
        const params = [];

        if (filters.category) {
            sql += ' AND category = ?';
            params.push(filters.category);
        }

        if (filters.popular) {
            sql += ' AND popular = 1';
        }

        if (filters.search) {
            sql += ' AND name LIKE ?';
            params.push(`%${filters.search}%`);
        }

        // Count total
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const countResult = await this.query(countSql, params);
        const total = countResult[0].total;

        // Add sorting
        sql += ' ORDER BY name ASC';

        // Add pagination
        const offset = (page - 1) * limit;
        sql += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const breeds = await this.query(sql, params);

        return {
            data: breeds,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    // Update breed
    static async update(id, breedData) {
        const updates = [];
        const params = [];

        const allowedFields = [
            'name', 'category', 'description', 'temperament',
            'care_requirements', 'health_considerations',
            'average_size', 'average_weight', 'life_expectancy',
            'image_url', 'popular'
        ];

        for (const field of allowedFields) {
            if (breedData[field] !== undefined) {
                updates.push(`${field} = ?`);
                params.push(breedData[field]);
            }
        }

        if (updates.length === 0) return false;

        params.push(id);

        const sql = `UPDATE breeds SET ${updates.join(', ')} WHERE id = ?`;
        
        const result = await this.update(sql, params);
        return result > 0;
    }

    // Delete breed
    static async delete(id) {
        // Check if breed is used by any pets
        const pets = await this.getOne(
            'SELECT COUNT(*) as count FROM pets WHERE breed_id = ?',
            [id]
        );

        if (pets.count > 0) {
            throw new Error('Cannot delete breed that is used by pets');
        }

        await this.query('DELETE FROM breeds WHERE id = ?', [id]);
        return true;
    }

    // Get breeds by category
    static async getByCategory(category) {
        return await this.query(
            'SELECT * FROM breeds WHERE category = ? ORDER BY name ASC',
            [category]
        );
    }

    // Get popular breeds
    static async getPopular(limit = 10) {
        return await this.query(
            'SELECT * FROM breeds WHERE popular = 1 ORDER BY name ASC LIMIT ?',
            [limit]
        );
    }

    // Get breed guide
    static async getGuide(breedId) {
        const breed = await this.findById(breedId);
        
        if (!breed) return null;

        // Get additional guide info from guides table
        const guide = await this.getOne(
            `SELECT * FROM guides 
             WHERE breed_id = ? AND guide_type = 'breed' AND status = 'published'
             ORDER BY published_at DESC LIMIT 1`,
            [breedId]
        );

        return {
            ...breed,
            guide
        };
    }

    // Get pets by breed
    static async getPets(breedId, limit = 20) {
        return await this.query(
            `SELECT p.*, 
                    (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1) as primary_image,
                    u.first_name as seller_name
             FROM pets p
             LEFT JOIN users u ON p.seller_id = u.id
             WHERE p.breed_id = ? AND p.status = 'available'
             ORDER BY p.created_at DESC
             LIMIT ?`,
            [breedId, limit]
        );
    }

    // Get breed statistics
    static async getStats() {
        const stats = await this.query(
            `SELECT 
                b.category,
                COUNT(DISTINCT b.id) as breed_count,
                COUNT(p.id) as pet_count,
                AVG(p.price) as avg_price
             FROM breeds b
             LEFT JOIN pets p ON b.id = p.breed_id AND p.status = 'available'
             GROUP BY b.category
             ORDER BY b.category`
        );

        return stats;
    }

    // Search breeds
    static async search(query, limit = 10) {
        return await this.query(
            `SELECT * FROM breeds 
             WHERE name LIKE ? 
             OR description LIKE ? 
             OR temperament LIKE ?
             ORDER BY 
                CASE 
                    WHEN name LIKE ? THEN 1
                    WHEN name LIKE ? THEN 2
                    ELSE 3
                END,
                name ASC
             LIMIT ?`,
            [`%${query}%`, `%${query}%`, `%${query}%`, `${query}%`, `%${query}%`, limit]
        );
    }

    // Get breed suggestions based on user preferences
    static async getSuggestions(preferences) {
        const {
            category,
            size, // small, medium, large
            good_with_children,
            good_with_pets,
            shedding,
            grooming,
            trainability
        } = preferences;

        let sql = 'SELECT * FROM breeds WHERE 1=1';
        const params = [];

        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }

        // These would need actual columns in the database
        // This is a simplified version
        sql += ' ORDER BY popular DESC, name ASC LIMIT 10';

        return await this.query(sql, params);
    }

    // Get breed of the month (featured)
    static async getBreedOfMonth() {
        // This could be rotated monthly, using popular flag for now
        return await this.getOne(
            'SELECT * FROM breeds WHERE popular = 1 ORDER BY RAND() LIMIT 1'
        );
    }

    // Get breed count by category
    static async getCountByCategory() {
        return await this.query(
            `SELECT 
                category,
                COUNT(*) as count
             FROM breeds
             GROUP BY category
             ORDER BY category`
        );
    }

    // Bulk import breeds
    static async bulkImport(breedsArray) {
        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        for (const breed of breedsArray) {
            try {
                // Check if breed already exists
                const existing = await this.findByName(breed.name);
                if (existing) {
                    await this.update(existing.id, breed);
                } else {
                    await this.create(breed);
                }
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    breed: breed.name,
                    error: error.message
                });
            }
        }

        return results;
    }

    // Get similar breeds
    static async getSimilar(breedId, limit = 5) {
        const breed = await this.findById(breedId);
        
        if (!breed) return [];

        return await this.query(
            `SELECT * FROM breeds 
             WHERE id != ? 
               AND category = ?
               AND (
                   average_size LIKE CONCAT('%', SUBSTRING_INDEX(?, ' ', 1), '%')
                   OR temperament LIKE CONCAT('%', SUBSTRING_INDEX(?, ' ', 1), '%')
               )
             ORDER BY popular DESC
             LIMIT ?`,
            [breedId, breed.category, breed.average_size, breed.temperament, limit]
        );
    }
}

module.exports = BreedModel;