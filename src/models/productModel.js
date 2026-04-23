// src/models/productModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class ProductModel extends DB {
    // Create new product
    static async create(productData) {
        const {
            seller_id, name, category, subcategory, pet_type,
            description, price, sale_price, currency = 'USD',
            stock_quantity, sku, brand, weight_kg, dimensions,
            materials, care_instructions, status = 'active'
        } = productData;

        const id = uuidv4();

        await this.query(
            `INSERT INTO products (
                id, seller_id, name, category, subcategory, pet_type,
                description, price, sale_price, currency, stock_quantity,
                sku, brand, weight_kg, dimensions, materials,
                care_instructions, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [id, seller_id, name, category, subcategory, JSON.stringify(pet_type),
             description, price, sale_price, currency, stock_quantity,
             sku, brand, weight_kg, JSON.stringify(dimensions), materials,
             care_instructions, status]
        );

        return id;
    }

    // Find product by ID
    static async findById(id) {
        const product = await this.getOne(
            `SELECT p.*, u.first_name as seller_name, u.email as seller_email,
                    u.phone as seller_phone, u.profile_image_url as seller_image
             FROM products p
             LEFT JOIN users u ON p.seller_id = u.id
             WHERE p.id = ? AND p.deleted_at IS NULL`,
            [id]
        );

        if (product) {
            // Parse JSON fields
            if (product.pet_type) product.pet_type = JSON.parse(product.pet_type);
            if (product.dimensions) product.dimensions = JSON.parse(product.dimensions);

            // Get images
            product.images = await this.query(
                'SELECT image_url, is_primary FROM product_images WHERE product_id = ? ORDER BY sort_order',
                [id]
            );

            // Get reviews
            product.reviews = await this.query(
                `SELECT pr.*, u.first_name, u.last_name, u.profile_image_url
                 FROM product_reviews pr
                 LEFT JOIN users u ON pr.user_id = u.id
                 WHERE pr.product_id = ?
                 ORDER BY pr.created_at DESC
                 LIMIT 10`,
                [id]
            );

            // Calculate average rating
            if (product.reviews.length > 0) {
                const sum = product.reviews.reduce((acc, r) => acc + r.rating, 0);
                product.rating_avg = (sum / product.reviews.length).toFixed(1);
            }
        }

        return product;
    }

    // Find by SKU
    static async findBySku(sku) {
        return await this.getOne(
            'SELECT * FROM products WHERE sku = ? AND deleted_at IS NULL',
            [sku]
        );
    }

    // Get all products with filters
    static async findAll(filters = {}, page = 1, limit = 20) {
        let sql = `
            SELECT p.*,
                   (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
            FROM products p
            WHERE p.deleted_at IS NULL
        `;
        const params = [];

        // Apply filters
        if (filters.category) {
            sql += ' AND p.category = ?';
            params.push(filters.category);
        }

        if (filters.subcategory) {
            sql += ' AND p.subcategory = ?';
            params.push(filters.subcategory);
        }

        if (filters.seller_id) {
            sql += ' AND p.seller_id = ?';
            params.push(filters.seller_id);
        }

        if (filters.status) {
            sql += ' AND p.status = ?';
            params.push(filters.status);
        } else {
            sql += " AND p.status = 'active'";
        }

        if (filters.min_price) {
            sql += ' AND p.price >= ?';
            params.push(filters.min_price);
        }

        if (filters.max_price) {
            sql += ' AND p.price <= ?';
            params.push(filters.max_price);
        }

        if (filters.on_sale) {
            sql += ' AND p.sale_price IS NOT NULL';
        }

        if (filters.in_stock) {
            sql += ' AND p.stock_quantity > 0';
        }

        if (filters.pet_type) {
            sql += ' AND JSON_CONTAINS(p.pet_type, ?)';
            params.push(JSON.stringify(filters.pet_type));
        }

        if (filters.brand) {
            sql += ' AND p.brand = ?';
            params.push(filters.brand);
        }

        if (filters.search) {
            sql += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.brand LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
        }

        if (filters.min_rating) {
            sql += ' AND p.rating_avg >= ?';
            params.push(filters.min_rating);
        }

        // Count total
        const countSql = sql.replace(
            'SELECT p.*, (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image',
            'SELECT COUNT(*) as total'
        );
        const countResult = await this.query(countSql, params);
        const total = countResult[0].total;

        // Add sorting
        const sortField = filters.sort_by || 'created_at';
        const sortOrder = filters.sort_order || 'DESC';
        
        const allowedSortFields = ['price', 'created_at', 'rating_avg', 'name', 'view_count'];
        const finalSortField = allowedSortFields.includes(sortField) ? sortField : 'created_at';
        
        sql += ` ORDER BY p.${finalSortField} ${sortOrder}`;

        // Add pagination
        const offset = (page - 1) * limit;
        sql += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const products = await this.query(sql, params);

        return {
            data: products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    // Update product
    static async update(id, productData) {
        const updates = [];
        const params = [];

        const allowedFields = [
            'name', 'category', 'subcategory', 'pet_type', 'description',
            'price', 'sale_price', 'currency', 'stock_quantity', 'sku',
            'brand', 'weight_kg', 'dimensions', 'materials', 'care_instructions', 'status'
        ];

        for (const field of allowedFields) {
            if (productData[field] !== undefined) {
                updates.push(`${field} = ?`);
                if (field === 'pet_type' || field === 'dimensions') {
                    params.push(JSON.stringify(productData[field]));
                } else {
                    params.push(productData[field]);
                }
            }
        }

        if (updates.length === 0) return false;

        updates.push('updated_at = NOW()');
        params.push(id);

        const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ?`;
        
        const result = await this.update(sql, params);
        return result > 0;
    }

    // Delete product (soft delete)
    static async delete(id) {
        await this.query(
            'UPDATE products SET deleted_at = NOW(), status = "discontinued" WHERE id = ?',
            [id]
        );
        return true;
    }

    // Add product image
    static async addImage(productId, imageUrl, isPrimary = false) {
        if (isPrimary) {
            await this.query(
                'UPDATE product_images SET is_primary = false WHERE product_id = ?',
                [productId]
            );
        }

        await this.query(
            `INSERT INTO product_images (product_id, image_url, is_primary, sort_order)
             VALUES (?, ?, ?, 0)`,
            [productId, imageUrl, isPrimary]
        );
    }

    // Remove product image
    static async removeImage(imageId) {
        await this.query('DELETE FROM product_images WHERE id = ?', [imageId]);
    }

    // Set primary image
    static async setPrimaryImage(productId, imageId) {
        await this.query(
            'UPDATE product_images SET is_primary = false WHERE product_id = ?',
            [productId]
        );
        await this.query(
            'UPDATE product_images SET is_primary = true WHERE id = ? AND product_id = ?',
            [imageId, productId]
        );
    }

    // Add review
    static async addReview(productId, userId, rating, reviewText, verifiedPurchase = false) {
        // Check if user already reviewed
        const existing = await this.getOne(
            'SELECT id FROM product_reviews WHERE product_id = ? AND user_id = ?',
            [productId, userId]
        );

        if (existing) {
            // Update existing review
            await this.query(
                `UPDATE product_reviews 
                 SET rating = ?, review_text = ?, verified_purchase = ?, updated_at = NOW()
                 WHERE product_id = ? AND user_id = ?`,
                [rating, reviewText, verifiedPurchase, productId, userId]
            );
        } else {
            // Insert new review
            await this.query(
                `INSERT INTO product_reviews (product_id, user_id, rating, review_text, verified_purchase, created_at)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [productId, userId, rating, reviewText, verifiedPurchase]
            );
        }

        // Update product rating
        await this.updateAverageRating(productId);
    }

    // Update average rating
    static async updateAverageRating(productId) {
        const [stats] = await this.query(
            `SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
             FROM product_reviews
             WHERE product_id = ?`,
            [productId]
        );

        await this.query(
            `UPDATE products 
             SET rating_avg = ?, rating_count = ?, updated_at = NOW()
             WHERE id = ?`,
            [stats.avg_rating || 0, stats.review_count, productId]
        );
    }

    // Get reviews for product
    static async getReviews(productId, page = 1, limit = 10) {
        const offset = (page - 1) * limit;

        const reviews = await this.query(
            `SELECT pr.*, u.first_name, u.last_name, u.profile_image_url
             FROM product_reviews pr
             LEFT JOIN users u ON pr.user_id = u.id
             WHERE pr.product_id = ?
             ORDER BY pr.created_at DESC
             LIMIT ? OFFSET ?`,
            [productId, limit, offset]
        );

        const [total] = await this.query(
            'SELECT COUNT(*) as count FROM product_reviews WHERE product_id = ?',
            [productId]
        );

        return {
            data: reviews,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Update stock
    static async updateStock(productId, quantity) {
        await this.query(
            `UPDATE products 
             SET stock_quantity = GREATEST(0, stock_quantity + ?),
                 status = CASE 
                    WHEN stock_quantity + ? <= 0 THEN 'out_of_stock'
                    ELSE status
                 END,
                 updated_at = NOW()
             WHERE id = ?`,
            [quantity, quantity, productId]
        );
    }

    // Check stock availability
    static async checkStock(productId, requestedQuantity) {
        const product = await this.getOne(
            'SELECT stock_quantity FROM products WHERE id = ?',
            [productId]
        );
        
        return product && product.stock_quantity >= requestedQuantity;
    }

    // Increment view count
    static async incrementViews(productId) {
        await this.query(
            'UPDATE products SET view_count = view_count + 1 WHERE id = ?',
            [productId]
        );
    }

    // Get products by seller
    static async findBySeller(sellerId, page = 1, limit = 20) {
        return await this.findAll({ seller_id: sellerId }, page, limit);
    }

    // Get featured products
    static async getFeatured(limit = 10) {
        return await this.query(
            `SELECT p.*,
                    (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
             FROM products p
             WHERE p.featured = 1 AND p.status = 'active' AND p.deleted_at IS NULL
             ORDER BY p.created_at DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Get related products
    static async getRelated(productId, limit = 6) {
        const product = await this.getOne(
            'SELECT category, subcategory FROM products WHERE id = ?',
            [productId]
        );

        if (!product) return [];

        return await this.query(
            `SELECT p.*,
                    (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
             FROM products p
             WHERE p.id != ? 
               AND (p.category = ? OR p.subcategory = ?)
               AND p.status = 'active'
               AND p.deleted_at IS NULL
             ORDER BY p.created_at DESC
             LIMIT ?`,
            [productId, product.category, product.subcategory, limit]
        );
    }

    // Get seller stats
    static async getSellerStats(sellerId) {
        const stats = await this.getOne(
            `SELECT 
                COUNT(*) as total_products,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_products,
                SUM(CASE WHEN status = 'out_of_stock' THEN 1 ELSE 0 END) as out_of_stock,
                AVG(price) as avg_price,
                SUM(view_count) as total_views,
                SUM(purchase_count) as total_sales,
                AVG(rating_avg) as avg_rating
             FROM products
             WHERE seller_id = ? AND deleted_at IS NULL`,
            [sellerId]
        );

        return stats;
    }

    // Get low stock products
    static async getLowStock(sellerId, threshold = 5) {
        return await this.query(
            `SELECT id, name, sku, stock_quantity
             FROM products
             WHERE seller_id = ? 
               AND status = 'active'
               AND stock_quantity <= ?
               AND deleted_at IS NULL
             ORDER BY stock_quantity ASC`,
            [sellerId, threshold]
        );
    }

    // Bulk update status
    static async bulkUpdateStatus(productIds, status) {
        const placeholders = productIds.map(() => '?').join(',');
        await this.query(
            `UPDATE products 
             SET status = ?, updated_at = NOW()
             WHERE id IN (${placeholders})`,
            [status, ...productIds]
        );
    }

    // Get all brands
    static async getBrands() {
        return await this.query(
            `SELECT DISTINCT brand 
             FROM products 
             WHERE brand IS NOT NULL AND brand != '' 
             ORDER BY brand`
        );
    }

    // Get categories with counts
    static async getCategories() {
        return await this.query(
            `SELECT 
                category,
                COUNT(*) as product_count
             FROM products
             WHERE status = 'active' AND deleted_at IS NULL
             GROUP BY category
             ORDER BY category`
        );
    }
}

module.exports = ProductModel;