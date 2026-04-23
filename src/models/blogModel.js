// src/models/blogModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class BlogModel extends DB {
    // Create new blog post
    static async create(postData) {
        const {
            author_id, title, slug, excerpt, content,
            featured_image_url, category, tags, status = 'draft'
        } = postData;

        const id = uuidv4();

        await this.query(
            `INSERT INTO blog_posts (
                id, author_id, title, slug, excerpt, content,
                featured_image_url, category, tags, status,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [id, author_id, title, slug, excerpt, content,
             featured_image_url, category, JSON.stringify(tags || []), status]
        );

        return id;
    }

    // Find blog post by ID
    static async findById(id) {
        const post = await this.getOne(
            `SELECT bp.*, u.first_name, u.last_name, u.email, u.profile_image_url
             FROM blog_posts bp
             LEFT JOIN users u ON bp.author_id = u.id
             WHERE bp.id = ?`,
            [id]
        );

        if (post) {
            if (post.tags) post.tags = JSON.parse(post.tags);
            post.comment_count = await this.getCommentCount(id);
        }

        return post;
    }

    // Find blog post by slug
    static async findBySlug(slug) {
        const post = await this.getOne(
            `SELECT bp.*, u.first_name, u.last_name, u.email, u.profile_image_url
             FROM blog_posts bp
             LEFT JOIN users u ON bp.author_id = u.id
             WHERE bp.slug = ? AND bp.status = 'published'`,
            [slug]
        );

        if (post) {
            if (post.tags) post.tags = JSON.parse(post.tags);
            post.comment_count = await this.getCommentCount(post.id);
            
            // Increment view count
            await this.incrementViews(post.id);
        }

        return post;
    }

    // Get all blog posts
    static async findAll(filters = {}, page = 1, limit = 10) {
        let sql = `
            SELECT bp.*, u.first_name, u.last_name, u.profile_image_url,
                   (SELECT COUNT(*) FROM comments WHERE comment_type = 'blog' AND target_id = bp.id) as comment_count
            FROM blog_posts bp
            LEFT JOIN users u ON bp.author_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.status) {
            sql += ' AND bp.status = ?';
            params.push(filters.status);
        } else {
            sql += " AND bp.status = 'published'";
        }

        if (filters.category) {
            sql += ' AND bp.category = ?';
            params.push(filters.category);
        }

        if (filters.author_id) {
            sql += ' AND bp.author_id = ?';
            params.push(filters.author_id);
        }

        if (filters.tag) {
            sql += ' AND JSON_CONTAINS(bp.tags, ?)';
            params.push(JSON.stringify(filters.tag));
        }

        if (filters.search) {
            sql += ' AND (bp.title LIKE ? OR bp.content LIKE ? OR bp.excerpt LIKE ?)';
            const searchTerm = `%${filters.search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        // Count total
        const countSql = sql.replace(
            'SELECT bp.*, u.first_name, u.last_name, u.profile_image_url, (SELECT COUNT(*) FROM comments WHERE comment_type = \'blog\' AND target_id = bp.id) as comment_count',
            'SELECT COUNT(*) as total'
        );
        const countResult = await this.query(countSql, params);
        const total = countResult[0].total;

        // Add sorting
        const sortField = filters.sort_by || 'published_at';
        const sortOrder = filters.sort_order || 'DESC';
        sql += ` ORDER BY bp.${sortField} ${sortOrder}`;

        // Add pagination
        const offset = (page - 1) * limit;
        sql += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const posts = await this.query(sql, params);

        // Parse tags for each post
        posts.forEach(post => {
            if (post.tags) post.tags = JSON.parse(post.tags);
        });

        return {
            data: posts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    // Update blog post
    static async update(id, postData) {
        const updates = [];
        const params = [];

        const allowedFields = [
            'title', 'slug', 'excerpt', 'content',
            'featured_image_url', 'category', 'tags', 'status'
        ];

        for (const field of allowedFields) {
            if (postData[field] !== undefined) {
                updates.push(`${field} = ?`);
                if (field === 'tags') {
                    params.push(JSON.stringify(postData[field]));
                } else {
                    params.push(postData[field]);
                }
            }
        }

        if (postData.status === 'published' && !postData.published_at) {
            updates.push('published_at = NOW()');
        }

        if (updates.length === 0) return false;

        updates.push('updated_at = NOW()');
        params.push(id);

        const sql = `UPDATE blog_posts SET ${updates.join(', ')} WHERE id = ?`;
        
        const result = await this.update(sql, params);
        return result > 0;
    }

    // Delete blog post
    static async delete(id) {
        await this.query('DELETE FROM blog_posts WHERE id = ?', [id]);
        return true;
    }

    // Increment view count
    static async incrementViews(id) {
        await this.query(
            'UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?',
            [id]
        );
    }

    // Get comment count for post
    static async getCommentCount(postId) {
        const [result] = await this.query(
            'SELECT COUNT(*) as count FROM comments WHERE comment_type = "blog" AND target_id = ?',
            [postId]
        );
        return result.count;
    }

    // Get related posts
    static async getRelated(postId, limit = 3) {
        const post = await this.findById(postId);
        if (!post) return [];

        return await this.query(
            `SELECT bp.*, u.first_name, u.last_name
             FROM blog_posts bp
             LEFT JOIN users u ON bp.author_id = u.id
             WHERE bp.id != ? 
               AND bp.category = ?
               AND bp.status = 'published'
             ORDER BY bp.published_at DESC
             LIMIT ?`,
            [postId, post.category, limit]
        );
    }

    // Get featured posts
    static async getFeatured(limit = 5) {
        return await this.query(
            `SELECT bp.*, u.first_name, u.last_name,
                    (SELECT COUNT(*) FROM comments WHERE comment_type = 'blog' AND target_id = bp.id) as comment_count
             FROM blog_posts bp
             LEFT JOIN users u ON bp.author_id = u.id
             WHERE bp.status = 'published'
             ORDER BY bp.view_count DESC, bp.published_at DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Get posts by author
    static async getByAuthor(authorId, page = 1, limit = 10) {
        return await this.findAll({ author_id: authorId, status: 'published' }, page, limit);
    }

    // Get posts by category
    static async getByCategory(category, page = 1, limit = 10) {
        return await this.findAll({ category, status: 'published' }, page, limit);
    }

    // Get posts by tag
    static async getByTag(tag, page = 1, limit = 10) {
        return await this.findAll({ tag, status: 'published' }, page, limit);
    }

    // Get archive by month
    static async getArchive() {
        return await this.query(
            `SELECT 
                DATE_FORMAT(published_at, '%Y-%m') as month,
                DATE_FORMAT(published_at, '%M %Y') as month_name,
                COUNT(*) as post_count
             FROM blog_posts
             WHERE status = 'published'
             GROUP BY DATE_FORMAT(published_at, '%Y-%m')
             ORDER BY month DESC`
        );
    }

    // Get popular posts
    static async getPopular(limit = 5) {
        return await this.query(
            `SELECT bp.*, u.first_name, u.last_name
             FROM blog_posts bp
             LEFT JOIN users u ON bp.author_id = u.id
             WHERE bp.status = 'published'
             ORDER BY bp.view_count DESC, bp.published_at DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Search posts
    static async search(query, page = 1, limit = 10) {
        return await this.findAll({ search: query, status: 'published' }, page, limit);
    }

    // Get categories with counts
    static async getCategories() {
        return await this.query(
            `SELECT 
                category,
                COUNT(*) as post_count
             FROM blog_posts
             WHERE status = 'published'
             GROUP BY category
             ORDER BY category`
        );
    }

    // Get tags with counts
    static async getTags() {
        const posts = await this.query(
            'SELECT tags FROM blog_posts WHERE status = "published" AND tags IS NOT NULL'
        );

        const tagCounts = {};
        posts.forEach(post => {
            if (post.tags) {
                const tags = JSON.parse(post.tags);
                tags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            }
        });

        return Object.entries(tagCounts)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
    }

    // Get next post
    static async getNextPost(currentId) {
        const current = await this.findById(currentId);
        if (!current) return null;

        return await this.getOne(
            `SELECT id, title, slug
             FROM blog_posts
             WHERE published_at > ? AND status = 'published'
             ORDER BY published_at ASC
             LIMIT 1`,
            [current.published_at]
        );
    }

    // Get previous post
    static async getPreviousPost(currentId) {
        const current = await this.findById(currentId);
        if (!current) return null;

        return await this.getOne(
            `SELECT id, title, slug
             FROM blog_posts
             WHERE published_at < ? AND status = 'published'
             ORDER BY published_at DESC
             LIMIT 1`,
            [current.published_at]
        );
    }

    // Get author stats
    static async getAuthorStats(authorId) {
        const stats = await this.getOne(
            `SELECT 
                COUNT(*) as total_posts,
                SUM(view_count) as total_views,
                AVG(view_count) as avg_views,
                MAX(view_count) as most_viewed,
                MIN(published_at) as first_post,
                MAX(published_at) as latest_post
             FROM blog_posts
             WHERE author_id = ? AND status = 'published'`,
            [authorId]
        );

        return stats;
    }

    // Get overall stats (admin)
    static async getStats() {
        const stats = await this.getOne(
            `SELECT 
                COUNT(*) as total_posts,
                SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published_posts,
                SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_posts,
                SUM(view_count) as total_views,
                AVG(view_count) as avg_views,
                COUNT(DISTINCT author_id) as total_authors,
                COUNT(DISTINCT category) as total_categories
             FROM blog_posts`
        );

        // Posts by month
        stats.posts_by_month = await this.query(
            `SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COUNT(*) as count
             FROM blog_posts
             GROUP BY DATE_FORMAT(created_at, '%Y-%m')
             ORDER BY month DESC
             LIMIT 12`
        );

        return stats;
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
            'SELECT slug FROM blog_posts WHERE slug = ?',
            [slug]
        );

        let counter = 1;
        while (existing) {
            const newSlug = `${slug}-${counter}`;
            existing = await this.getOne(
                'SELECT slug FROM blog_posts WHERE slug = ?',
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

    // Bulk publish/unpublish
    static async bulkUpdateStatus(postIds, status) {
        const placeholders = postIds.map(() => '?').join(',');
        const updates = ['status = ?', 'updated_at = NOW()'];
        
        if (status === 'published') {
            updates.push('published_at = NOW()');
        }

        await this.query(
            `UPDATE blog_posts 
             SET ${updates.join(', ')}
             WHERE id IN (${placeholders})`,
            [status, ...postIds]
        );
    }

    // Get reading time estimate
    static getReadingTime(content) {
        const wordsPerMinute = 200;
        const wordCount = content.trim().split(/\s+/).length;
        const minutes = Math.ceil(wordCount / wordsPerMinute);
        return `${minutes} min read`;
    }
}

module.exports = BlogModel;