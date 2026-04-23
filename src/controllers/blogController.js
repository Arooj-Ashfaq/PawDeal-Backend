// src/controllers/blogController.js
const BlogModel = require('../models/blogModel');
const UserModel = require('../models/userModel');
const CommentModel = require('../models/commentModel');
const { uploadSingle, deleteFile } = require('../middleware/upload');
const path = require('path');

// Create blog post
const createPost = async (req, res) => {
    try {
        const userId = req.user.id;

        // Check if user is admin or author
        if (req.user.role !== 'admin' && req.user.role !== 'author') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to create blog posts'
            });
        }

        const {
            title, content, excerpt, category,
            tags, status = 'draft'
        } = req.body;

        // Generate slug from title
        const slug = await BlogModel.generateSlug(title);

        const postId = await BlogModel.create({
            author_id: userId,
            title,
            slug,
            excerpt: excerpt || content.substring(0, 200),
            content,
            category,
            tags: tags ? tags.split(',').map(t => t.trim()) : [],
            status
        });

        res.status(201).json({
            success: true,
            message: 'Blog post created successfully',
            postId,
            slug
        });
    } catch (error) {
        console.error('Create blog post error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create blog post'
        });
    }
};

// Get all blog posts
const getPosts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            category,
            author_id,
            tag,
            search,
            status = 'published',
            sort_by = 'published_at',
            sort_order = 'DESC'
        } = req.query;

        // Only admins can see drafts
        let effectiveStatus = status;
        if (status === 'draft' && req.user?.role !== 'admin') {
            effectiveStatus = 'published';
        }

        const filters = {
            category,
            author_id,
            tag,
            search,
            status: effectiveStatus,
            sort_by,
            sort_order
        };

        const result = await BlogModel.findAll(filters, page, limit);

        // Add reading time to each post
        for (const post of result.data) {
            post.reading_time = BlogModel.getReadingTime(post.content);
        }

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Get blog posts error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch blog posts'
        });
    }
};

// Get single blog post by slug
const getPostBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        const post = await BlogModel.findBySlug(slug);

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Blog post not found'
            });
        }

        // Add reading time
        post.reading_time = BlogModel.getReadingTime(post.content);

        // Get comments
        const comments = await CommentModel.getComments('blog', post.id, 1, 20);

        // Get next and previous posts
        const [next, previous] = await Promise.all([
            BlogModel.getNextPost(post.id),
            BlogModel.getPreviousPost(post.id)
        ]);

        // Get related posts
        const related = await BlogModel.getRelated(post.id);

        res.json({
            success: true,
            post,
            comments: comments.data,
            comment_count: comments.pagination.total,
            next_post: next,
            previous_post: previous,
            related_posts: related
        });
    } catch (error) {
        console.error('Get blog post error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch blog post'
        });
    }
};

// Get single blog post by ID (admin)
const getPostById = async (req, res) => {
    try {
        const { id } = req.params;

        const post = await BlogModel.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Blog post not found'
            });
        }

        // Check if user can view draft
        if (post.status === 'draft' && req.user?.role !== 'admin' && req.user?.id !== post.author_id) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to view this post'
            });
        }

        post.reading_time = BlogModel.getReadingTime(post.content);

        res.json({
            success: true,
            post
        });
    } catch (error) {
        console.error('Get blog post by ID error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch blog post'
        });
    }
};

// Update blog post
const updatePost = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const post = await BlogModel.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Blog post not found'
            });
        }

        // Check authorization
        if (post.author_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to update this post'
            });
        }

        const {
            title, content, excerpt, category,
            tags, status
        } = req.body;

        const updateData = {};

        if (title) {
            updateData.title = title;
            updateData.slug = await BlogModel.generateSlug(title);
        }
        if (content) updateData.content = content;
        if (excerpt) updateData.excerpt = excerpt;
        if (category) updateData.category = category;
        if (tags) updateData.tags = tags.split(',').map(t => t.trim());
        if (status) updateData.status = status;

        const updated = await BlogModel.update(id, updateData);

        if (updated) {
            const updatedPost = await BlogModel.findById(id);
            res.json({
                success: true,
                message: 'Blog post updated successfully',
                post: updatedPost
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'No changes made'
            });
        }
    } catch (error) {
        console.error('Update blog post error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update blog post'
        });
    }
};

// Delete blog post
const deletePost = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const post = await BlogModel.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Blog post not found'
            });
        }

        // Check authorization
        if (post.author_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to delete this post'
            });
        }

        // Delete featured image if exists
        if (post.featured_image_url) {
            const imagePath = path.join(__dirname, '../../', post.featured_image_url);
            deleteFile(imagePath);
        }

        await BlogModel.delete(id);

        res.json({
            success: true,
            message: 'Blog post deleted successfully'
        });
    } catch (error) {
        console.error('Delete blog post error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete blog post'
        });
    }
};

// Upload featured image
const uploadFeaturedImage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const post = await BlogModel.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Blog post not found'
            });
        }

        // Check authorization
        if (post.author_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to update this post'
            });
        }

        uploadSingle('image')(req, res, async (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No image provided'
                });
            }

            // Delete old image if exists
            if (post.featured_image_url) {
                const oldPath = path.join(__dirname, '../../', post.featured_image_url);
                deleteFile(oldPath);
            }

            const imageUrl = `/uploads/blog/${req.file.filename}`;

            await BlogModel.update(id, { featured_image_url: imageUrl });

            res.json({
                success: true,
                message: 'Featured image uploaded successfully',
                image_url: imageUrl
            });
        });
    } catch (error) {
        console.error('Upload featured image error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload image'
        });
    }
};

// Get posts by author
const getPostsByAuthor = async (req, res) => {
    try {
        const { authorId } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const author = await UserModel.findById(authorId);
        if (!author) {
            return res.status(404).json({
                success: false,
                error: 'Author not found'
            });
        }

        const result = await BlogModel.getByAuthor(authorId, page, limit);

        res.json({
            success: true,
            author: {
                id: author.id,
                name: `${author.first_name} ${author.last_name}`,
                avatar: author.profile_image_url,
                bio: author.bio
            },
            ...result
        });
    } catch (error) {
        console.error('Get posts by author error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch posts by author'
        });
    }
};

// Get posts by category
const getPostsByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const result = await BlogModel.getByCategory(category, page, limit);

        res.json({
            success: true,
            category,
            ...result
        });
    } catch (error) {
        console.error('Get posts by category error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch posts by category'
        });
    }
};

// Get posts by tag
const getPostsByTag = async (req, res) => {
    try {
        const { tag } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const result = await BlogModel.getByTag(tag, page, limit);

        res.json({
            success: true,
            tag,
            ...result
        });
    } catch (error) {
        console.error('Get posts by tag error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch posts by tag'
        });
    }
};

// Get featured posts
const getFeaturedPosts = async (req, res) => {
    try {
        const { limit = 5 } = req.query;

        const posts = await BlogModel.getFeatured(limit);

        res.json({
            success: true,
            data: posts
        });
    } catch (error) {
        console.error('Get featured posts error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch featured posts'
        });
    }
};

// Get popular posts
const getPopularPosts = async (req, res) => {
    try {
        const { limit = 5 } = req.query;

        const posts = await BlogModel.getPopular(limit);

        res.json({
            success: true,
            data: posts
        });
    } catch (error) {
        console.error('Get popular posts error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch popular posts'
        });
    }
};

// Get archive
const getArchive = async (req, res) => {
    try {
        const archive = await BlogModel.getArchive();

        res.json({
            success: true,
            data: archive
        });
    } catch (error) {
        console.error('Get archive error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch archive'
        });
    }
};

// Get categories with counts
const getCategories = async (req, res) => {
    try {
        const categories = await BlogModel.getCategories();

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch categories'
        });
    }
};

// Get tags with counts
const getTags = async (req, res) => {
    try {
        const tags = await BlogModel.getTags();

        res.json({
            success: true,
            data: tags
        });
    } catch (error) {
        console.error('Get tags error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tags'
        });
    }
};

// Search posts
const searchPosts = async (req, res) => {
    try {
        const { q, page = 1, limit = 10 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query required'
            });
        }

        const result = await BlogModel.search(q, page, limit);

        res.json({
            success: true,
            query: q,
            ...result
        });
    } catch (error) {
        console.error('Search posts error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search posts'
        });
    }
};

// Get author stats
const getAuthorStats = async (req, res) => {
    try {
        const { authorId } = req.params;

        const author = await UserModel.findById(authorId);
        if (!author) {
            return res.status(404).json({
                success: false,
                error: 'Author not found'
            });
        }

        const stats = await BlogModel.getAuthorStats(authorId);

        res.json({
            success: true,
            author: {
                id: author.id,
                name: `${author.first_name} ${author.last_name}`
            },
            stats
        });
    } catch (error) {
        console.error('Get author stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch author stats'
        });
    }
};

// Get blog statistics (admin)
const getBlogStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const stats = await BlogModel.getStats();

        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        console.error('Get blog stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get blog statistics'
        });
    }
};

// Bulk publish/unpublish (admin)
const bulkUpdateStatus = async (req, res) => {
    try {
        const { post_ids, status } = req.body;

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        if (!Array.isArray(post_ids) || post_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Post IDs array required'
            });
        }

        await BlogModel.bulkUpdateStatus(post_ids, status);

        res.json({
            success: true,
            message: `${post_ids.length} posts updated successfully`
        });
    } catch (error) {
        console.error('Bulk update status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to bulk update posts'
        });
    }
};

module.exports = {
    createPost,
    getPosts,
    getPostBySlug,
    getPostById,
    updatePost,
    deletePost,
    uploadFeaturedImage,
    getPostsByAuthor,
    getPostsByCategory,
    getPostsByTag,
    getFeaturedPosts,
    getPopularPosts,
    getArchive,
    getCategories,
    getTags,
    searchPosts,
    getAuthorStats,
    getBlogStats,
    bulkUpdateStatus
};