// src/controllers/messageController.js
const MessageModel = require('../models/messageModel');
const UserModel = require('../models/userModel');
const PetModel = require('../models/petModel');
const ProductModel = require('../models/productModel');
const { sendNewMessageEmail } = require('../services/emailService');

// Get user's conversations
const getConversations = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        const conversations = await MessageModel.getUserConversations(userId, page, limit);

        // Get unread count
        const unreadCount = await MessageModel.getUnreadCount(userId);

        res.json({
            success: true,
            ...conversations,
            unread_count: unreadCount
        });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch conversations'
        });
    }
};

// Get single conversation
const getConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { page = 1, limit = 50 } = req.query;

        const conversation = await MessageModel.getConversationWithDetails(id, userId);

        if (!conversation) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        // Get messages
        const messages = await MessageModel.getMessages(id, userId, page, limit);

        res.json({
            success: true,
            conversation,
            messages
        });
    } catch (error) {
        if (error.message === 'Not authorized to view this conversation') {
            return res.status(403).json({
                success: false,
                error: error.message
            });
        }
        console.error('Get conversation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch conversation'
        });
    }
};

// Create new conversation
const createConversation = async (req, res) => {
    try {
        const userId = req.user.id;
        const { receiver_id, related_pet_id, related_product_id, initial_message } = req.body;

        // Check if receiver exists
        const receiver = await UserModel.findById(receiver_id);
        if (!receiver) {
            return res.status(404).json({
                success: false,
                error: 'Receiver not found'
            });
        }

        // Check if trying to message self
        if (receiver_id === userId) {
            return res.status(400).json({
                success: false,
                error: 'Cannot start conversation with yourself'
            });
        }

        // Check related item if provided
        if (related_pet_id) {
            const pet = await PetModel.findById(related_pet_id);
            if (!pet) {
                return res.status(404).json({
                    success: false,
                    error: 'Related pet not found'
                });
            }
        }

        if (related_product_id) {
            const product = await ProductModel.findById(related_product_id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: 'Related product not found'
                });
            }
        }

        // Get or create conversation
        const conversationId = await MessageModel.getOrCreateConversation(
            userId,
            receiver_id,
            related_pet_id,
            related_product_id
        );

        // Send initial message if provided
        if (initial_message) {
            await MessageModel.sendMessage(
                conversationId,
                userId,
                receiver_id,
                initial_message
            );
        }

        // Get the conversation
        const conversation = await MessageModel.getConversationWithDetails(conversationId, userId);

        res.status(201).json({
            success: true,
            message: 'Conversation created successfully',
            conversation
        });
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create conversation'
        });
    }
};

// Send message
const sendMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { content } = req.body;

        if (!content || content.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Message content is required'
            });
        }

        // Get conversation to find receiver
        const conversation = await MessageModel.getConversation(id, userId);
        
        // Find receiver (the other participant)
        const receiver = conversation.participants.find(p => p.id !== userId);
        if (!receiver) {
            return res.status(404).json({
                success: false,
                error: 'Receiver not found in conversation'
            });
        }

        // Send message
        const messageId = await MessageModel.sendMessage(
            id,
            userId,
            receiver.id,
            content
        );

        // Get the created message
        const [message] = await MessageModel.query(
            `SELECT m.*, u.first_name, u.last_name, u.profile_image_url
             FROM messages m
             INNER JOIN users u ON m.sender_id = u.id
             WHERE m.id = ?`,
            [messageId]
        );

        // Send email notification if user has email notifications enabled
        const receiverPrefs = receiver.notification_preferences || {};
        if (receiverPrefs.email !== false) {
            const sender = await UserModel.findById(userId);
            await sendNewMessageEmail(receiver, sender, content.substring(0, 100));
        }

        // Emit socket event (handled by socket handler)
        const io = req.app.get('io');
        io.to(`user:${receiver.id}`).emit('new_message', {
            conversationId: id,
            message
        });

        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            data: message
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send message'
        });
    }
};

// Mark messages as read
const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await MessageModel.markConversationAsRead(id, userId);

        // Get updated unread count
        const unreadCount = await MessageModel.getUnreadCount(userId);

        // Emit socket event
        const io = req.app.get('io');
        io.to(`user:${userId}`).emit('messages_read', {
            conversationId: id
        });

        res.json({
            success: true,
            message: 'Messages marked as read',
            unread_count: unreadCount
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark messages as read'
        });
    }
};

// Archive conversation
const archiveConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await MessageModel.archiveConversation(id, userId);

        res.json({
            success: true,
            message: 'Conversation archived'
        });
    } catch (error) {
        console.error('Archive conversation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to archive conversation'
        });
    }
};

// Unarchive conversation
const unarchiveConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await MessageModel.unarchiveConversation(id, userId);

        res.json({
            success: true,
            message: 'Conversation unarchived'
        });
    } catch (error) {
        console.error('Unarchive conversation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unarchive conversation'
        });
    }
};

// Block conversation
const blockConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if user is admin or participant
        const conversation = await MessageModel.getConversation(id, userId);
        
        await MessageModel.blockConversation(id, userId);

        res.json({
            success: true,
            message: 'Conversation blocked'
        });
    } catch (error) {
        console.error('Block conversation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to block conversation'
        });
    }
};

// Delete conversation (for user)
const deleteConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await MessageModel.deleteForUser(id, userId);

        res.json({
            success: true,
            message: 'Conversation deleted'
        });
    } catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete conversation'
        });
    }
};

// Search messages
const searchMessages = async (req, res) => {
    try {
        const userId = req.user.id;
        const { q, page = 1, limit = 20 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query required'
            });
        }

        const results = await MessageModel.search(userId, q, page, limit);

        res.json({
            success: true,
            query: q,
            ...results
        });
    } catch (error) {
        console.error('Search messages error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search messages'
        });
    }
};

// Get unread count
const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id;

        const count = await MessageModel.getUnreadCount(userId);

        res.json({
            success: true,
            unread_count: count
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get unread count'
        });
    }
};

// Get conversation stats
const getConversationStats = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const conversation = await MessageModel.getConversation(id, userId);
        
        const stats = await MessageModel.getStats(id);

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Get conversation stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get conversation stats'
        });
    }
};

// Get user's message stats
const getUserStats = async (req, res) => {
    try {
        const userId = req.user.id;

        const stats = await MessageModel.getUserStats(userId);

        // Get total conversations
        const [conversations] = await MessageModel.query(
            'SELECT COUNT(*) as count FROM conversation_participants WHERE user_id = ?',
            [userId]
        );

        res.json({
            success: true,
            stats: {
                ...stats,
                total_conversations: conversations.count
            }
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user stats'
        });
    }
};

// Report message (for inappropriate content)
const reportMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { reason } = req.body;

        // Get message
        const [message] = await MessageModel.query(
            'SELECT * FROM messages WHERE id = ?',
            [id]
        );

        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        // Log report (you'd save to a reports table)
        console.log(`Message ${id} reported by user ${userId}: ${reason}`);

        // Notify admins (would implement notification system)
        
        res.json({
            success: true,
            message: 'Message reported successfully'
        });
    } catch (error) {
        console.error('Report message error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to report message'
        });
    }
};

// Get conversation participants
const getParticipants = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const conversation = await MessageModel.getConversation(id, userId);

        res.json({
            success: true,
            participants: conversation.participants
        });
    } catch (error) {
        console.error('Get participants error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get participants'
        });
    }
};

// Mute conversation
const muteConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await MessageModel.query(
            'UPDATE conversation_participants SET is_muted = true WHERE conversation_id = ? AND user_id = ?',
            [id, userId]
        );

        res.json({
            success: true,
            message: 'Conversation muted'
        });
    } catch (error) {
        console.error('Mute conversation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mute conversation'
        });
    }
};

// Unmute conversation
const unmuteConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await MessageModel.query(
            'UPDATE conversation_participants SET is_muted = false WHERE conversation_id = ? AND user_id = ?',
            [id, userId]
        );

        res.json({
            success: true,
            message: 'Conversation unmuted'
        });
    } catch (error) {
        console.error('Unmute conversation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unmute conversation'
        });
    }
};

// Get conversation by related item
const getConversationByItem = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, id } = req.params;

        let conversationId = null;

        if (type === 'pet') {
            const [conv] = await MessageModel.query(
                `SELECT c.id FROM conversations c
                 INNER JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
                 INNER JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
                 WHERE c.related_pet_id = ? AND cp1.user_id = ? AND cp2.user_id != ?
                 LIMIT 1`,
                [id, userId, userId]
            );
            conversationId = conv?.id;
        } else if (type === 'product') {
            const [conv] = await MessageModel.query(
                `SELECT c.id FROM conversations c
                 INNER JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
                 INNER JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
                 WHERE c.related_product_id = ? AND cp1.user_id = ? AND cp2.user_id != ?
                 LIMIT 1`,
                [id, userId, userId]
            );
            conversationId = conv?.id;
        }

        if (!conversationId) {
            return res.status(404).json({
                success: false,
                error: 'No conversation found for this item'
            });
        }

        const conversation = await MessageModel.getConversationWithDetails(conversationId, userId);

        res.json({
            success: true,
            conversation
        });
    } catch (error) {
        console.error('Get conversation by item error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get conversation'
        });
    }
};

module.exports = {
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
};