// src/controllers/commentController.js
const CommentModel = require('../models/commentModel');
const UserModel = require('../models/userModel');
const BlogModel = require('../models/blogModel');
const GuideModel = require('../models/guideModel');
const PetModel = require('../models/petModel');

// Create comment
const createComment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { comment_type, target_id, content, parent_comment_id } = req.body;

        // Validate target exists
        let targetExists = false;
        switch (comment_type) {
            case 'blog':
                targetExists = await BlogModel.findById(target_id);
                break;
            case 'guide':
                targetExists = await GuideModel.findById(target_id);
                break;
            case 'pet':
                targetExists = await PetModel.findById(target_id);
                break;
            case 'breed':
                targetExists = await require('../models/breedModel').findById(target_id);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid comment type'
                });
        }

        if (!targetExists) {
            return res.status(404).json({
                success: false,
                error: 'Target not found'
            });
        }

        // If it's a reply, check if parent comment exists
        if (parent_comment_id) {
            const parentComment = await CommentModel.findById(parent_comment_id);
            if (!parentComment) {
                return res.status(404).json({
                    success: false,
                    error: 'Parent comment not found'
                });
            }
        }

        const commentId = await CommentModel.create({
            user_id: userId,
            comment_type,
            target_id,
            content,
            parent_comment_id
        });

        // Get the created comment
        const comment = await CommentModel.findById(commentId);

        res.status(201).json({
            success: true,
            message: 'Comment added successfully',
            comment
        });
    } catch (error) {
        console.error('Create comment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add comment'
        });
    }
};

// Get comments for a target
const getComments = async (req, res) => {
    try {
        const { type, id } = req.params;
        const { page = 1, limit = 20, sort = 'newest' } = req.query;

        const result = await CommentModel.getComments(type, id, page, limit, sort);

        // Check if current user liked each comment
        if (req.user) {
            for (const comment of result.data) {
                comment.is_liked = await CommentModel.hasLiked(comment.id, req.user.id);
                
                // Check likes for replies
                if (comment.replies) {
                    for (const reply of comment.replies) {
                        reply.is_liked = await CommentModel.hasLiked(reply.id, req.user.id);
                    }
                }
            }
        }

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch comments'
        });
    }
};

// Update comment
const updateComment = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { content } = req.body;

        const updated = await CommentModel.update(id, userId, content);

        if (updated) {
            const comment = await CommentModel.findById(id);
            res.json({
                success: true,
                message: 'Comment updated successfully',
                comment
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Comment not found or not authorized'
            });
        }
    } catch (error) {
        console.error('Update comment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update comment'
        });
    }
};

// Delete comment
const deleteComment = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const isAdmin = req.user.role === 'admin';

        const deleted = await CommentModel.delete(id, userId, isAdmin);

        if (deleted) {
            res.json({
                success: true,
                message: 'Comment deleted successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Comment not found or not authorized'
            });
        }
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete comment'
        });
    }
};

// Like comment
const likeComment = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const liked = await CommentModel.like(id, userId);

        if (liked) {
            const likeCount = await CommentModel.getLikeCount(id);
            
            // Emit socket event for real-time updates
            const io = req.app.get('io');
            io.emit('comment_liked', {
                commentId: id,
                likeCount
            });

            res.json({
                success: true,
                message: 'Comment liked',
                like_count: likeCount
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Comment already liked'
            });
        }
    } catch (error) {
        console.error('Like comment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to like comment'
        });
    }
};

// Unlike comment
const unlikeComment = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await CommentModel.unlike(id, userId);

        const likeCount = await CommentModel.getLikeCount(id);

        // Emit socket event
        const io = req.app.get('io');
        io.emit('comment_unliked', {
            commentId: id,
            likeCount
        });

        res.json({
            success: true,
            message: 'Comment unliked',
            like_count: likeCount
        });
    } catch (error) {
        console.error('Unlike comment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unlike comment'
        });
    }
};

// Get comment replies
const getReplies = async (req, res) => {
    try {
        const { id } = req.params;

        const replies = await CommentModel.getReplies(id);

        // Check if current user liked each reply
        if (req.user) {
            for (const reply of replies) {
                reply.is_liked = await CommentModel.hasLiked(reply.id, req.user.id);
            }
        }

        res.json({
            success: true,
            data: replies
        });
    } catch (error) {
        console.error('Get replies error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch replies'
        });
    }
};

// Report comment
const reportComment = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { reason } = req.body;

        await CommentModel.report(id, userId, reason);

        res.json({
            success: true,
            message: 'Comment reported successfully'
        });
    } catch (error) {
        console.error('Report comment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to report comment'
        });
    }
};

// Moderate comment (admin)
const moderateComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'hide', 'unhide', 'delete'

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        if (action === 'delete') {
            await CommentModel.moderate(id, 'delete');
        } else {
            await CommentModel.moderate(id, action === 'hide' ? 'hide' : 'show');
        }

        res.json({
            success: true,
            message: `Comment ${action}d successfully`
        });
    } catch (error) {
        console.error('Moderate comment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to moderate comment'
        });
    }
};

// Get user's comment history
const getUserComments = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        // Check if user exists
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const result = await CommentModel.getUserComments(userId, page, limit);

        res.json({
            success: true,
            user: {
                id: user.id,
                name: `${user.first_name} ${user.last_name}`,
                avatar: user.profile_image_url
            },
            ...result
        });
    } catch (error) {
        console.error('Get user comments error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user comments'
        });
    }
};

// Get recent comments (for feed)
const getRecentComments = async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const comments = await CommentModel.getRecent(limit);

        res.json({
            success: true,
            data: comments
        });
    } catch (error) {
        console.error('Get recent comments error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch recent comments'
        });
    }
};

// Get reported comments (admin)
const getReportedComments = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const comments = await CommentModel.getReported();

        res.json({
            success: true,
            data: comments
        });
    } catch (error) {
        console.error('Get reported comments error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch reported comments'
        });
    }
};

// Get comment thread
const getCommentThread = async (req, res) => {
    try {
        const { id } = req.params;

        const thread = await CommentModel.getThread(id);

        if (!thread) {
            return res.status(404).json({
                success: false,
                error: 'Comment not found'
            });
        }

        // Check likes for current user
        if (req.user) {
            const checkLikes = async (comment) => {
                comment.is_liked = await CommentModel.hasLiked(comment.id, req.user.id);
                if (comment.replies) {
                    for (const reply of comment.replies) {
                        reply.is_liked = await CommentModel.hasLiked(reply.id, req.user.id);
                    }
                }
            };
            await checkLikes(thread);
        }

        res.json({
            success: true,
            thread
        });
    } catch (error) {
        console.error('Get comment thread error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch comment thread'
        });
    }
};

// Get comment statistics (admin)
const getCommentStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const stats = await CommentModel.getStats();

        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        console.error('Get comment stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get comment statistics'
        });
    }
};

// Bulk delete comments (admin)
const bulkDeleteComments = async (req, res) => {
    try {
        const { comment_ids } = req.body;

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        if (!Array.isArray(comment_ids) || comment_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Comment IDs array required'
            });
        }

        for (const id of comment_ids) {
            await CommentModel.moderate(id, 'delete');
        }

        res.json({
            success: true,
            message: `${comment_ids.length} comments deleted successfully`
        });
    } catch (error) {
        console.error('Bulk delete comments error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete comments'
        });
    }
};

// Export user comments (GDPR)
const exportUserComments = async (req, res) => {
    try {
        const userId = req.user.id;

        const data = await CommentModel.exportUserData(userId);

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Export user comments error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export user comments'
        });
    }
};

module.exports = {
    createComment,
    getComments,
    updateComment,
    deleteComment,
    likeComment,
    unlikeComment,
    getReplies,
    reportComment,
    moderateComment,
    getUserComments,
    getRecentComments,
    getReportedComments,
    getCommentThread,
    getCommentStats,
    bulkDeleteComments,
    exportUserComments
};