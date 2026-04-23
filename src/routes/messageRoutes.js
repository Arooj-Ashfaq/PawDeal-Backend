// src/routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const {
    getConversations,
    getConversation,
    createConversation,
    sendMessage,
    markAsRead,
    archiveConversation,
    unarchiveConversation,
    blockConversation,
    deleteConversation,
    searchMessages,
    getUnreadCount,
    getConversationStats,
    getUserStats,
    reportMessage,
    getParticipants,
    muteConversation,
    unmuteConversation,
    getConversationByItem
} = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');
const { validate, messageValidation } = require('../middleware/validation');
const { messageLimiter } = require('../middleware/rateLimiter');

// All routes require authentication
router.use(authenticate);

// Conversation list
router.get('/conversations', getConversations);
router.get('/conversations/unread', getUnreadCount);
router.get('/conversations/stats', getUserStats);
router.get('/conversations/search', searchMessages);

// Conversation by related item
router.get('/conversations/item/:type/:id', getConversationByItem);

// Single conversation
router.get('/conversations/:id', getConversation);
router.get('/conversations/:id/participants', getParticipants);
router.get('/conversations/:id/stats', getConversationStats);

// Create conversation
router.post('/conversations', createConversation);

// Message actions
router.post('/conversations/:id/messages', messageLimiter, validate(messageValidation.send), sendMessage);
router.patch('/conversations/:id/read', markAsRead);

// Conversation management
router.patch('/conversations/:id/archive', archiveConversation);
router.patch('/conversations/:id/unarchive', unarchiveConversation);
router.patch('/conversations/:id/block', blockConversation);
router.patch('/conversations/:id/mute', muteConversation);
router.patch('/conversations/:id/unmute', unmuteConversation);
router.delete('/conversations/:id', deleteConversation);

// Report message
router.post('/messages/:id/report', reportMessage);

module.exports = router;