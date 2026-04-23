// src/models/guideModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class GuideModel extends DB {
    // Create new guide
    static async create(guideData) {
        const {
            author_id, title, slug, guide_type, breed_id,
            content, featured_image_url, difficulty,
            estimated_read_time, status = 'draft'
        } = guideData;

        const id = uuidv4();

        await this.query(
            `INSERT INTO guides (
                id, author_id, title, slug, guide_type, breed_id,
                content, featured_image_url, difficulty, estimated_read_time,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [id, author_id, title, slug, guide_type, breed_id,
             content, featured_image_url, difficulty, estimated_read_time, status]
        );

        return id;
    }

    // Find guide by ID
    static async findById(id) {
        const guide = await this.getOne(
            `SELECT g.*, u.first_name, u.last_name, u.email, u.profile_image_url,
                    b.name as breed_name, b.category as breed_category
             FROM guides g
             LEFT JOIN users u ON g.author_id = u.id
             LEFT JOIN breeds b ON g.breed_id = b.id
             WHERE g.id = ?`,
            [id]
        );

        if (guide) {
            guide.comment_count = await this.getCommentCount(id);
        }

        return guide;
    }

    // Find guide by slug
    static async findBySlug(slug) {
        const guide = await this.getOne(
            `SELECT g.*, u.first_name, u.last_name, u.email, u.profile_image_url,
                    b.name as breed_name, b.category as breed_category,
                    b.description as breed_description, b.temperament as breed_temperament
             FROM guides g
             LEFT JOIN users u ON g.author_id = u.id
             LEFT JOIN breeds b ON g.breed_id = b.id
             WHERE g.slug = ? AND g.status = 'published'`,
            [slug]
        );

        if (guide) {
            guide.comment_count = await this.getCommentCount(guide.id);
            
            // Increment view count
            await this.incrementViews(guide.id);
            
            // Mark as helpful? This would be user action
        }

        return guide;
    }

    // Get all guides
    static async findAll(filters = {}, page = 1, limit = 12) {
        let sql = `
            SELECT g.*, u.first_name, u.last_name,
                   b.name as breed_name,
                   (SELECT COUNT(*) FROM comments WHERE comment_type = 'guide' AND target_id = g.id) as comment_count
            FROM guides g
            LEFT JOIN users u ON g.author_id = u.id
            LEFT JOIN breeds b ON g.breed_id = b.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.status) {
            sql += ' AND g.status = ?';
            params.push(filters.status);
        } else {
            sql += " AND g.status = 'published'";
        }

        if (filters.guide_type) {
            sql += ' AND g.guide_type = ?';
            params.push(filters.guide_type);
        }

        if (filters.breed_id) {
            sql += ' AND g.breed_id = ?';
            params.push(filters.breed_id);
        }

        if (filters.author_id) {
            sql += ' AND g.author_id = ?';
            params.push(filters.author_id);
        }

        if (filters.difficulty) {
            sql += ' AND g.difficulty = ?';
            params.push(filters.difficulty);
        }

        if (filters.search) {
            sql += ' AND (g.title LIKE ? OR g.content LIKE ?)';
            const searchTerm = `%${filters.search}%`;
            params.push(searchTerm, searchTerm);
        }

        // Count total
        const countSql = sql.replace(
            'SELECT g.*, u.first_name, u.last_name, b.name as breed_name, (SELECT COUNT(*) FROM comments WHERE comment_type = \'guide\' AND target_id = g.id) as comment_count',
            'SELECT COUNT(*) as total'
        );
        const countResult = await this.query(countSql, params);
        const total = countResult[0].total;

        // Add sorting
        const sortField = filters.sort_by || 'published_at';
        const sortOrder = filters.sort_order || 'DESC';
        sql += ` ORDER BY g.${sortField} ${sortOrder}`;

        // Add pagination
        const offset = (page - 1) * limit;
        sql += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const guides = await this.query(sql, params);

        return {
            data: guides,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    // Update guide
    static async update(id, guideData) {
        const updates = [];
        const params = [];

        const allowedFields = [
            'title', 'slug', 'guide_type', 'breed_id', 'content',
            'featured_image_url', 'difficulty', 'estimated_read_time', 'status'
        ];

        for (const field of allowedFields) {
            if (guideData[field] !== undefined) {
                updates.push(`${field} = ?`);
                params.push(guideData[field]);
            }
        }

        if (guideData.status === 'published' && !guideData.published_at) {
            updates.push('published_at = NOW()');
        }

        if (updates.length === 0) return false;

        updates.push('updated_at = NOW()');
        params.push(id);

        const sql = `UPDATE guides SET ${updates.join(', ')} WHERE id = ?`;
        
        const result = await this.update(sql, params);
        return result > 0;
    }

    // Delete guide
    static async delete(id) {
        await this.query('DELETE FROM guides WHERE id = ?', [id]);
        return true;
    }

    // Increment view count
    static async incrementViews(id) {
        await this.query(
            'UPDATE guides SET view_count = view_count + 1 WHERE id = ?',
            [id]
        );
    }

    // Mark guide as helpful
    static async markHelpful(id) {
        await this.query(
            'UPDATE guides SET helpful_count = helpful_count + 1 WHERE id = ?',
            [id]
        );
    }

    // Get comment count for guide
    static async getCommentCount(guideId) {
        const [result] = await this.query(
            'SELECT COUNT(*) as count FROM comments WHERE comment_type = "guide" AND target_id = ?',
            [guideId]
        );
        return result.count;
    }

    // Get guides by type
    static async getByType(guideType, page = 1, limit = 12) {
        return await this.findAll({ guide_type: guideType }, page, limit);
    }

    // Get guides by breed
    static async getByBreed(breedId, page = 1, limit = 12) {
        return await this.findAll({ breed_id: breedId }, page, limit);
    }

    // Get guides by author
    static async getByAuthor(authorId, page = 1, limit = 12) {
        return await this.findAll({ author_id: authorId }, page, limit);
    }

    // Get popular guides
    static async getPopular(limit = 6) {
        return await this.query(
            `SELECT g.*, u.first_name, u.last_name,
                    b.name as breed_name
             FROM guides g
             LEFT JOIN users u ON g.author_id = u.id
             LEFT JOIN breeds b ON g.breed_id = b.id
             WHERE g.status = 'published'
             ORDER BY g.view_count DESC, g.helpful_count DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Get featured guides
    static async getFeatured(limit = 3) {
        // For now, just get most recent with high ratings
        return await this.query(
            `SELECT g.*, u.first_name, u.last_name,
                    b.name as breed_name
             FROM guides g
             LEFT JOIN users u ON g.author_id = u.id
             LEFT JOIN breeds b ON g.breed_id = b.id
             WHERE g.status = 'published'
             ORDER BY g.helpful_count DESC, g.created_at DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Get related guides
    static async getRelated(guideId, limit = 3) {
        const guide = await this.findById(guideId);
        if (!guide) return [];

        return await this.query(
            `SELECT g.*, u.first_name, u.last_name,
                    b.name as breed_name
             FROM guides g
             LEFT JOIN users u ON g.author_id = u.id
             LEFT JOIN breeds b ON g.breed_id = b.id
             WHERE g.id != ? 
               AND (g.guide_type = ? OR g.breed_id = ?)
               AND g.status = 'published'
             ORDER BY g.published_at DESC
             LIMIT ?`,
            [guideId, guide.guide_type, guide.breed_id, limit]
        );
    }

    // Search guides
    static async search(query, page = 1, limit = 12) {
        return await this.findAll({ search: query }, page, limit);
    }

    // Get guide statistics
    static async getStats() {
        const stats = await this.getOne(
            `SELECT 
                COUNT(*) as total_guides,
                SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published_guides,
                SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_guides,
                SUM(view_count) as total_views,
                SUM(helpful_count) as total_helpful,
                AVG(view_count) as avg_views,
                COUNT(DISTINCT author_id) as total_authors,
                COUNT(DISTINCT breed_id) as total_breeds_covered
             FROM guides`
        );

        // Guides by type
        stats.by_type = await this.query(
            `SELECT 
                guide_type,
                COUNT(*) as count
             FROM guides
             WHERE status = 'published'
             GROUP BY guide_type`
        );

        // Guides by difficulty
        stats.by_difficulty = await this.query(
            `SELECT 
                difficulty,
                COUNT(*) as count
             FROM guides
             WHERE status = 'published'
             GROUP BY difficulty`
        );

        // Most viewed guides
        stats.top_guides = await this.query(
            `SELECT title, view_count, helpful_count
             FROM guides
             WHERE status = 'published'
             ORDER BY view_count DESC
             LIMIT 5`
        );

        return stats;
    }

    // Get beginner guides
    static async getBeginnerGuides(limit = 10) {
        return await this.query(
            `SELECT g.*, u.first_name, u.last_name,
                    b.name as breed_name
             FROM guides g
             LEFT JOIN users u ON g.author_id = u.id
             LEFT JOIN breeds b ON g.breed_id = b.id
             WHERE g.status = 'published' AND g.difficulty = 'beginner'
             ORDER BY g.helpful_count DESC, g.created_at DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Get breed care guides
    static async getBreedCareGuides(limit = 10) {
        return await this.query(
            `SELECT g.*, u.first_name, u.last_name,
                    b.name as breed_name
             FROM guides g
             LEFT JOIN users u ON g.author_id = u.id
             LEFT JOIN breeds b ON g.breed_id = b.id
             WHERE g.status = 'published' AND g.guide_type = 'breed'
             ORDER BY g.view_count DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Get training guides
    static async getTrainingGuides(limit = 10) {
        return await this.query(
            `SELECT g.*, u.first_name, u.last_name,
                    b.name as breed_name
             FROM guides g
             LEFT JOIN users u ON g.author_id = u.id
             LEFT JOIN breeds b ON g.breed_id = b.id
             WHERE g.status = 'published' AND g.guide_type = 'training'
             ORDER BY g.helpful_count DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Get health guides
    static async getHealthGuides(limit = 10) {
        return await this.query(
            `SELECT g.*, u.first_name, u.last_name,
                    b.name as breed_name
             FROM guides g
             LEFT JOIN users u ON g.author_id = u.id
             LEFT JOIN breeds b ON g.breed_id = b.id
             WHERE g.status = 'published' AND g.guide_type = 'health'
             ORDER BY g.view_count DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Get buying guides
    static async getBuyingGuides(limit = 10) {
        return await this.query(
            `SELECT g.*, u.first_name, u.last_name,
                    b.name as breed_name
             FROM guides g
             LEFT JOIN users u ON g.author_id = u.id
             LEFT JOIN breeds b ON g.breed_id = b.id
             WHERE g.status = 'published' AND g.guide_type = 'buying'
             ORDER BY g.helpful_count DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Generate slug from title
    static async generateSlug(title) {
        let slug = title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/--+/g, '-')
            .trim();

        // Check if slug exists
        let existing = await this.getOne(
            'SELECT slug FROM guides WHERE slug = ?',
            [slug]
        );

        let counter = 1;
        while (existing) {
            const newSlug = `${slug}-${counter}`;
            existing = await this.getOne(
                'SELECT slug FROM guides WHERE slug = ?',
                [newSlug]
            );
            if (!existing) {
                slug = newSlug;
                break;
            }
            counter++;
        }

        return slug;
    }

    // Get reading time estimate
    static getReadingTime(content) {
        const wordsPerMinute = 200;
        const wordCount = content.trim().split(/\s+/).length;
        const minutes = Math.ceil(wordCount / wordsPerMinute);
        return `${minutes} min read`;
    }

    // Get next/previous guide
    static async getAdjacentGuides(currentId) {
        const current = await this.findById(currentId);
        if (!current) return { next: null, previous: null };

        const next = await this.getOne(
            `SELECT id, title, slug
             FROM guides
             WHERE published_at > ? AND status = 'published'
             ORDER BY published_at ASC
             LIMIT 1`,
            [current.published_at]
        );

        const previous = await this.getOne(
            `SELECT id, title, slug
             FROM guides
             WHERE published_at < ? AND status = 'published'
             ORDER BY published_at DESC
             LIMIT 1`,
            [current.published_at]
        );

        return { next, previous };
    }

    // Get author stats
    static async getAuthorStats(authorId) {
        const stats = await this.getOne(
            `SELECT 
                COUNT(*) as total_guides,
                SUM(view_count) as total_views,
                SUM(helpful_count) as total_helpful,
                AVG(view_count) as avg_views,
                AVG(helpful_count) as avg_helpful,
                MIN(published_at) as first_guide,
                MAX(published_at) as latest_guide
             FROM guides
             WHERE author_id = ? AND status = 'published'`,
            [authorId]
        );

        return stats;
    }

    // Bulk publish/unpublish
    static async bulkUpdateStatus(guideIds, status) {
        const placeholders = guideIds.map(() => '?').join(',');
        const updates = ['status = ?', 'updated_at = NOW()'];
        
        if (status === 'published') {
            updates.push('published_at = NOW()');
        }

        await this.query(
            `UPDATE guides 
             SET ${updates.join(', ')}
             WHERE id IN (${placeholders})`,
            [status, ...guideIds]
        );
    }
}

module.exports = GuideModel;