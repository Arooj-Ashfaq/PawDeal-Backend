// src/routes/blogRoutes.js
const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/blogController');
const { authenticate, optionalAuth, authorize } = require('../middleware/auth');

// Public routes
router.get('/', optionalAuth, getPosts);
router.get('/featured', getFeaturedPosts);
router.get('/popular', getPopularPosts);
router.get('/archive', getArchive);
router.get('/categories', getCategories);
router.get('/tags', getTags);
router.get('/search', searchPosts);
router.get('/author/:authorId', getPostsByAuthor);
router.get('/category/:category', getPostsByCategory);
router.get('/tag/:tag', getPostsByTag);
router.get('/slug/:slug', optionalAuth, getPostBySlug);
router.get('/author/:authorId/stats', getAuthorStats);

// Protected routes (require authentication)
router.use(authenticate);

// Blog management (authors and admins)
router.post('/', createPost);
router.get('/id/:id', getPostById);
router.put('/:id', updatePost);
router.delete('/:id', deletePost);
router.post('/:id/image', uploadFeaturedImage);

// Admin only routes
router.use(authorize('admin'));

router.get('/admin/stats', getBlogStats);
router.post('/admin/bulk-status', bulkUpdateStatus);

module.exports = router;