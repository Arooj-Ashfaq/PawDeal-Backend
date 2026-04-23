// src/models/commentModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class CommentModel extends DB {
    // Create a new comment
    static async create(commentData) {
        const {
            user_id, comment_type, target_id,
            content, parent_comment_id = null
        } = commentData;

        const id = uuidv4();

        await this.query(
            `INSERT INTO comments (
                id, user_id, comment_type, target_id,
                parent_comment_id, content, like_count,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, 'active', NOW(), NOW())`,
            [id, user_id, comment_type, target_id, parent_comment_id, content]
        );

        return id;
    }

    // Get comments for a target
    static async getComments(commentType, targetId, page = 1, limit = 20, sort = 'newest') {
        const offset = (page - 1) * limit;

        let orderBy = 'c.created_at DESC';
        if (sort === 'oldest') {
            orderBy = 'c.created_at ASC';
        } else if (sort === 'popular') {
            orderBy = 'c.like_count DESC, c.created_at DESC';
        }

        // Get top-level comments (not replies)
        const comments = await this.query(
            `SELECT c.*,
                    u.first_name, u.last_name, u.email, u.profile_image_url,
                    (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as likes_count,
                    (SELECT COUNT(*) FROM comments WHERE parent_comment_id = c.id) as replies_count
             FROM comments c
             INNER JOIN users u ON c.user_id = u.id
             WHERE c.comment_type = ? 
               AND c.target_id = ? 
               AND c.parent_comment_id IS NULL
               AND c.status = 'active'
             ORDER BY ${orderBy}
             LIMIT ? OFFSET ?`,
            [commentType, targetId, limit, offset]
        );

        const [total] = await this.query(
            `SELECT COUNT(*) as count
             FROM comments
             WHERE comment_type = ? AND target_id = ? AND parent_comment_id IS NULL AND status = 'active'`,
            [commentType, targetId]
        );

        // Get replies for each comment
        for (const comment of comments) {
            comment.replies = await this.getReplies(comment.id);
            
            // Check if current user liked this comment (if user_id provided)
            // This would need user_id passed separately
        }

        return {
            data: comments,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Get replies for a comment
    static async getReplies(commentId) {
        return await this.query(
            `SELECT c.*,
                    u.first_name, u.last_name, u.email, u.profile_image_url,
                    (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as likes_count
             FROM comments c
             INNER JOIN users u ON c.user_id = u.id
             WHERE c.parent_comment_id = ? AND c.status = 'active'
             ORDER BY c.created_at ASC`,
            [commentId]
        );
    }

    // Get comment by ID
    static async findById(id) {
        const comment = await this.getOne(
            `SELECT c.*,
                    u.first_name, u.last_name, u.email, u.profile_image_url
             FROM comments c
             INNER JOIN users u ON c.user_id = u.id
             WHERE c.id = ?`,
            [id]
        );

        if (comment) {
            comment.likes_count = await this.getLikeCount(id);
            comment.replies = await this.getReplies(id);
        }

        return comment;
    }

    // Update comment
    static async update(id, userId, content) {
        const comment = await this.getOne(
            'SELECT * FROM comments WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (!comment) {
            throw new Error('Comment not found or not authorized');
        }

        await this.query(
            'UPDATE comments SET content = ?, updated_at = NOW() WHERE id = ?',
            [content, id]
        );

        return true;
    }

    // Delete comment (soft delete)
    static async delete(id, userId, isAdmin = false) {
        let query = 'UPDATE comments SET status = "hidden" WHERE id = ?';
        const params = [id];

        if (!isAdmin) {
            query += ' AND user_id = ?';
            params.push(userId);
        }

        const result = await this.update(query, params);
        return result > 0;
    }

    // Like a comment
    static async like(commentId, userId) {
        // Check if already liked
        const existing = await this.getOne(
            'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?',
            [commentId, userId]
        );

        if (existing) {
            return false; // Already liked
        }

        await this.query(
            'INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, NOW())',
            [commentId, userId]
        );

        // Update like count in comments table
        await this.query(
            'UPDATE comments SET like_count = like_count + 1 WHERE id = ?',
            [commentId]
        );

        return true;
    }

    // Unlike a comment
    static async unlike(commentId, userId) {
        await this.query(
            'DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?',
            [commentId, userId]
        );

        // Update like count in comments table
        await this.query(
            'UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = ?',
            [commentId]
        );

        return true;
    }

    // Check if user liked comment
    static async hasLiked(commentId, userId) {
        if (!userId) return false;
        
        const like = await this.getOne(
            'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?',
            [commentId, userId]
        );
        return !!like;
    }

    // Get like count for comment
    static async getLikeCount(commentId) {
        const [result] = await this.query(
            'SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?',
            [commentId]
        );
        return result.count;
    }

    // Get comment count for target
    static async getCount(commentType, targetId) {
        const [result] = await this.query(
            'SELECT COUNT(*) as count FROM comments WHERE comment_type = ? AND target_id = ? AND status = "active"',
            [commentType, targetId]
        );
        return result.count;
    }

    // Report a comment
    static async report(commentId, userId, reason) {
        await this.query(
            `UPDATE comments 
             SET status = 'reported'
             WHERE id = ?`,
            [commentId]
        );

        // Log report (you might want a separate reports table)
        console.log(`Comment ${commentId} reported by ${userId}: ${reason}`);

        return true;
    }

    // Moderate comment (admin)
    static async moderate(commentId, action) {
        let status = 'active';
        if (action === 'hide') {
            status = 'hidden';
        } else if (action === 'delete') {
            return await this.query('DELETE FROM comments WHERE id = ?', [commentId]);
        }

        await this.query(
            'UPDATE comments SET status = ? WHERE id = ?',
            [status, commentId]
        );

        return true;
    }

    // Get user's comment history
    static async getUserComments(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const comments = await this.query(
            `SELECT c.*,
                    CASE 
                        WHEN c.comment_type = 'blog' THEN b.title
                        WHEN c.comment_type = 'guide' THEN g.title
                        WHEN c.comment_type = 'pet' THEN p.name
                    END as target_title
             FROM comments c
             LEFT JOIN blog_posts b ON c.comment_type = 'blog' AND c.target_id = b.id
             LEFT JOIN guides g ON c.comment_type = 'guide' AND c.target_id = g.id
             LEFT JOIN pets p ON c.comment_type = 'pet' AND c.target_id = p.id
             WHERE c.user_id = ? AND c.status = 'active'
             ORDER BY c.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        const [total] = await this.query(
            'SELECT COUNT(*) as count FROM comments WHERE user_id = ? AND status = "active"',
            [userId]
        );

        return {
            data: comments,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Get recent comments (for admin/feed)
    static async getRecent(limit = 20) {
        return await this.query(
            `SELECT c.*,
                    u.first_name, u.last_name, u.profile_image_url,
                    CASE 
                        WHEN c.comment_type = 'blog' THEN b.title
                        WHEN c.comment_type = 'guide' THEN g.title
                        WHEN c.comment_type = 'pet' THEN p.name
                    END as target_title
             FROM comments c
             INNER JOIN users u ON c.user_id = u.id
             LEFT JOIN blog_posts b ON c.comment_type = 'blog' AND c.target_id = b.id
             LEFT JOIN guides g ON c.comment_type = 'guide' AND c.target_id = g.id
             LEFT JOIN pets p ON c.comment_type = 'pet' AND c.target_id = p.id
             WHERE c.status = 'active'
             ORDER BY c.created_at DESC
             LIMIT ?`,
            [limit]
        );
    }

    // Get reported comments (admin)
    static async getReported() {
        return await this.query(
            `SELECT c.*, u.first_name, u.last_name, u.email
             FROM comments c
             INNER JOIN users u ON c.user_id = u.id
             WHERE c.status = 'reported'
             ORDER BY c.updated_at DESC`,
            []
        );
    }

    // Get comment thread (parent + all replies)
    static async getThread(commentId) {
        const comment = await this.findById(commentId);
        if (!comment) return null;

        if (comment.parent_comment_id) {
            // This is a reply, get the parent thread
            return await this.getThread(comment.parent_comment_id);
        }

        return comment;
    }

    // Get comment stats for admin
    static async getStats() {
        const stats = await this.getOne(
            `SELECT 
                COUNT(*) as total_comments,
                COUNT(DISTINCT user_id) as unique_users,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_comments,
                SUM(CASE WHEN status = 'reported' THEN 1 ELSE 0 END) as reported_comments,
                SUM(CASE WHEN parent_comment_id IS NOT NULL THEN 1 ELSE 0 END) as replies,
                AVG(like_count) as avg_likes
             FROM comments`
        );

        // Comments by type
        stats.by_type = await this.query(
            `SELECT 
                comment_type,
                COUNT(*) as count
             FROM comments
             GROUP BY comment_type`
        );

        // Most commented targets
        stats.top_targets = await this.query(
            `SELECT 
                comment_type,
                target_id,
                COUNT(*) as comment_count
             FROM comments
             GROUP BY comment_type, target_id
             ORDER BY comment_count DESC
             LIMIT 10`
        );

        return stats;
    }

    // Export user data (GDPR)
    static async exportUserData(userId) {
        const comments = await this.query(
            `SELECT 
                comment_type,
                target_id,
                content,
                like_count,
                created_at,
                updated_at
             FROM comments
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        const likes = await this.query(
            `SELECT 
                comment_id,
                created_at
             FROM comment_likes
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        return {
            comments_made: comments.length,
            comments,
            likes_given: likes.length,
            likes
        };
    }

    // Clean up old deleted comments (cron job)
    static async cleanupOld(days = 30) {
        const result = await this.query(
            `DELETE FROM comments 
             WHERE status = 'hidden' 
             AND updated_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );

        return result.affectedRows;
    }
}

module.exports = CommentModel;