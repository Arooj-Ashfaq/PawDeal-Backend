// src/models/petModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class PetModel extends DB {
    // Create new pet listing
    static async create(petData) {
        const {
            seller_id, name, breed_id, category, age_years, age_months,
            gender, price, description, health_status,
            vaccinated, dewormed, neutered, microchipped,
            registration_papers, color, weight_kg, city, state, country
        } = petData;

        const id = uuidv4();
        const currency = 'USD';

        await this.query(
            `INSERT INTO pets (
                id, seller_id, name, breed_id, category,
                age_years, age_months, gender, price, currency,
                description, health_status, vaccinated, dewormed,
                neutered, microchipped, registration_papers, color,
                weight_kg, city, state, country, status,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', NOW(), NOW())`,
            [id, seller_id, name, breed_id || null, category,
             age_years || 0, age_months || 0, gender, price, currency,
             description || null, health_status || null, vaccinated || 0, dewormed || 0,
             neutered || 0, microchipped || 0, registration_papers || 0, color || null,
             weight_kg || null, city || null, state || null, country || null]
        );

        return id;
    }

    // Find pet by ID
    static async findById(id) {
        const pet = await this.getOne(
            `SELECT p.*, u.first_name as seller_name, u.email as seller_email,
                    u.phone as seller_phone, u.profile_image_url as seller_image,
                    b.name as breed_name
             FROM pets p
             LEFT JOIN users u ON p.seller_id = u.id
             LEFT JOIN breeds b ON p.breed_id = b.id
             WHERE p.id = ?`,
            [id]
        );

        if (pet) {
            // Get images
            pet.images = await this.query(
                'SELECT image_url, is_primary FROM pet_images WHERE pet_id = ? ORDER BY sort_order',
                [id]
            );
        }

        return pet;
    }

    // Get all pets with filters
    static async findAll(filters = {}, page = 1, limit = 20) {
        let sql = `
            SELECT p.*, u.first_name as seller_name, b.name as breed_name,
                   (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1) as primary_image      
            FROM pets p
            LEFT JOIN users u ON p.seller_id = u.id
            LEFT JOIN breeds b ON p.breed_id = b.id
            WHERE 1=1
        `;
        const params = [];

        // Apply filters
        if (filters.category) {
            sql += ' AND p.category = ?';
            params.push(filters.category);
        }

        if (filters.status) {
            sql += ' AND p.status = ?';
            params.push(filters.status);
        } else {
            sql += " AND p.status = 'available'";
        }

        if (filters.gender) {
            sql += ' AND p.gender = ?';
            params.push(filters.gender);
        }

        if (filters.min_price) {
            sql += ' AND p.price >= ?';
            params.push(filters.min_price);
        }

        if (filters.max_price) {
            sql += ' AND p.price <= ?';
            params.push(filters.max_price);
        }

        if (filters.seller_id) {
            sql += ' AND p.seller_id = ?';
            params.push(filters.seller_id);
        }

        if (filters.search) {
            sql += ' AND (p.name LIKE ? OR p.description LIKE ? OR b.name LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
        }

        // Count total before pagination
        const countSql = sql.replace(
            'SELECT p.*, u.first_name as seller_name, b.name as breed_name, (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1) as primary_image',
            'SELECT COUNT(*) as total'
        );
        const countResult = await this.query(countSql, params);
        const total = countResult[0].total;

        // Add sorting
        const sortField = filters.sort_by || 'created_at';
        const sortOrder = filters.sort_order || 'DESC';
        sql += ` ORDER BY p.${sortField} ${sortOrder}`;

        // Add pagination
        const offset = (page - 1) * limit;
        sql += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const pets = await this.query(sql, params);

        return {
            data: pets,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    // Update pet - FIXED VERSION
    static async update(id, petData) {
        const updates = [];
        const params = [];

        const allowedFields = [
            'name', 'breed_id', 'category', 'age_years', 'age_months',
            'gender', 'price', 'description', 'health_status',
            'vaccinated', 'dewormed', 'neutered', 'microchipped',
            'registration_papers', 'color', 'weight_kg', 'city', 'state',
            'country', 'status'
        ];

        for (const field of allowedFields) {
            if (petData[field] !== undefined && petData[field] !== null) {
                updates.push(`${field} = ?`);
                params.push(petData[field]);
            }
        }

        if (updates.length === 0) return false;

        updates.push('updated_at = NOW()');
        params.push(id);

        const sql = `UPDATE pets SET ${updates.join(', ')} WHERE id = ?`;
        
        console.log('Update SQL:', sql);
        console.log('Update params:', params);

        const result = await this.query(sql, params);
        return result;
    }

    // Delete pet (soft delete)
    static async delete(id) {
        await this.query(
            'UPDATE pets SET deleted_at = NOW(), status = "unavailable" WHERE id = ?',
            [id]
        );
        return true;
    }

    // Add pet image
    static async addImage(petId, imageUrl, isPrimary = false) {
        if (isPrimary) {
            await this.query(
                'UPDATE pet_images SET is_primary = false WHERE pet_id = ?',
                [petId]
            );
        }

        await this.query(
            `INSERT INTO pet_images (pet_id, image_url, is_primary, sort_order, uploaded_at)
             VALUES (?, ?, ?, 0, NOW())`,
            [petId, imageUrl, isPrimary]
        );
    }

    // Remove pet image
    static async removeImage(imageId) {
        await this.query('DELETE FROM pet_images WHERE id = ?', [imageId]);
    }

    // Set primary image
    static async setPrimaryImage(petId, imageId) {
        await this.query(
            'UPDATE pet_images SET is_primary = false WHERE pet_id = ?',
            [petId]
        );
        await this.query(
            'UPDATE pet_images SET is_primary = true WHERE id = ? AND pet_id = ?',
            [imageId, petId]
        );
    }

    // Increment view count
    static async incrementViews(id) {
        await this.query(
            'UPDATE pets SET view_count = view_count + 1 WHERE id = ?',
            [id]
        );
    }

    // Get pets by seller
    static async findBySeller(sellerId, page = 1, limit = 20) {
        return await this.findAll({ seller_id: sellerId }, page, limit);
    }

    // Get featured pets
    static async getFeatured(limit = 10) {
        return await this.query(
            `SELECT p.*, u.first_name as seller_name,
                    (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1) as primary_image     
             FROM pets p
             LEFT JOIN users u ON p.seller_id = u.id
             WHERE p.featured = 1 AND p.status = 'available'
             ORDER BY p.created_at DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Update pet status
    static async updateStatus(id, status) {
        await this.query(
            'UPDATE pets SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );
    }

    // Toggle featured
    static async toggleFeatured(id) {
        await this.query(
            'UPDATE pets SET featured = NOT featured, updated_at = NOW() WHERE id = ?',
            [id]
        );
    }

    // Get similar pets
    static async getSimilar(petId, limit = 6) {
        const pet = await this.getOne(
            'SELECT breed_id, category FROM pets WHERE id = ?',
            [petId]
        );

        if (!pet) return [];

        return await this.query(
            `SELECT p.*,
                    (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1) as primary_image     
             FROM pets p
             WHERE p.id != ?
               AND (p.breed_id = ? OR p.category = ?)
               AND p.status = 'available'
             ORDER BY p.created_at DESC
             LIMIT ?`,
            [petId, pet.breed_id, pet.category, limit]
        );
    }

    // Get seller stats
    static async getSellerStats(sellerId) {
        const stats = await this.getOne(
            `SELECT
                COUNT(*) as total_listings,
                SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as active_listings,
                SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold,
                AVG(price) as avg_price,
                SUM(view_count) as total_views,
                SUM(favorite_count) as total_favorites
             FROM pets
             WHERE seller_id = ?`,
            [sellerId]
        );

        return stats;
    }
}

module.exports = PetModel;