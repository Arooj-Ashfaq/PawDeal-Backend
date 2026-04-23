// src/routes/commentRoutes.js
const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/commentController');
const { authenticate, optionalAuth, authorize } = require('../middleware/auth');
const { validate, commentValidation } = require('../middleware/validation');

// Public routes
router.get('/recent', getRecentComments);
router.get('/thread/:id', optionalAuth, getCommentThread);
router.get('/:type/:targetId', optionalAuth, getComments);
router.get('/replies/:id', getReplies);

// Protected routes (require authentication)
router.use(authenticate);

// Comment management
router.post('/', validate(commentValidation.create), createComment);
router.put('/:id', validate(commentValidation.id), updateComment);
router.delete('/:id', deleteComment);

// Interactions
router.post('/:id/like', likeComment);
router.delete('/:id/like', unlikeComment);
router.post('/:id/report', reportComment);

// User comments
router.get('/user/:userId', getUserComments);
router.get('/export/my', exportUserComments);

// Admin only routes
router.use(authorize('admin'));

router.get('/admin/reported', getReportedComments);
router.get('/admin/stats', getCommentStats);
router.patch('/:id/moderate', moderateComment);
router.post('/admin/bulk-delete', bulkDeleteComments);

module.exports = router;