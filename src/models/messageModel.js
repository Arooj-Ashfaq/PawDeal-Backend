// src/models/messageModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class MessageModel extends DB {
    // Create a new conversation
    static async createConversation(participantIds, relatedPetId = null, relatedProductId = null) {
        const conversationId = uuidv4();

        await this.query(
            `INSERT INTO conversations (id, created_at, updated_at, last_message_at, related_pet_id, related_product_id, status)
             VALUES (?, NOW(), NOW(), NOW(), ?, ?, 'active')`,
            [conversationId, relatedPetId, relatedProductId]
        );

        // Add participants
        for (const userId of participantIds) {
            await this.query(
                `INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
                 VALUES (?, ?, NOW())`,
                [conversationId, userId]
            );
        }

        return conversationId;
    }

    // Get or create conversation between two users
    static async getOrCreateConversation(user1Id, user2Id, relatedPetId = null, relatedProductId = null) {
        // Check if conversation already exists
        const existing = await this.getOne(
            `SELECT c.id
             FROM conversations c
             INNER JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
             INNER JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
             WHERE cp1.user_id = ? AND cp2.user_id = ?
               AND c.status = 'active'
               ${relatedPetId ? 'AND c.related_pet_id = ?' : ''}
               ${relatedProductId ? 'AND c.related_product_id = ?' : ''}
             LIMIT 1`,
            relatedPetId ? [user1Id, user2Id, relatedPetId] : 
            relatedProductId ? [user1Id, user2Id, relatedProductId] : 
            [user1Id, user2Id]
        );

        if (existing) {
            return existing.id;
        }

        // Create new conversation
        return await this.createConversation(
            [user1Id, user2Id],
            relatedPetId,
            relatedProductId
        );
    }

    // Send a message
    static async sendMessage(conversationId, senderId, receiverId, content) {
        const messageId = uuidv4();

        await this.query(
            `INSERT INTO messages (id, conversation_id, sender_id, receiver_id, message_content, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, false, NOW())`,
            [messageId, conversationId, senderId, receiverId, content]
        );

        // Update conversation last_message_at
        await this.query(
            'UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?',
            [conversationId]
        );

        return messageId;
    }

    // Get conversation by ID
    static async getConversation(conversationId, userId) {
        // Check if user is participant
        const participant = await this.getOne(
            'SELECT * FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, userId]
        );

        if (!participant) {
            throw new Error('Not authorized to view this conversation');
        }

        const conversation = await this.getOne(
            `SELECT c.*,
                    p.name as related_pet_name,
                    pr.name as related_product_name
             FROM conversations c
             LEFT JOIN pets p ON c.related_pet_id = p.id
             LEFT JOIN products pr ON c.related_product_id = pr.id
             WHERE c.id = ?`,
            [conversationId]
        );

        // Get participants
        conversation.participants = await this.query(
            `SELECT u.id, u.first_name, u.last_name, u.email, u.profile_image_url,
                    cp.last_read_at, cp.is_muted
             FROM conversation_participants cp
             INNER JOIN users u ON cp.user_id = u.id
             WHERE cp.conversation_id = ?`,
            [conversationId]
        );

        // Get messages
        conversation.messages = await this.getMessages(conversationId, userId);

        return conversation;
    }

    // Get messages in a conversation
    static async getMessages(conversationId, userId, page = 1, limit = 50) {
        const offset = (page - 1) * limit;

        const messages = await this.query(
            `SELECT m.*, 
                    u.first_name as sender_first_name,
                    u.last_name as sender_last_name,
                    u.profile_image_url as sender_image
             FROM messages m
             INNER JOIN users u ON m.sender_id = u.id
             WHERE m.conversation_id = ?
             ORDER BY m.created_at DESC
             LIMIT ? OFFSET ?`,
            [conversationId, limit, offset]
        );

        // Mark messages as read
        await this.query(
            `UPDATE messages 
             SET is_read = true, read_at = NOW()
             WHERE conversation_id = ? AND receiver_id = ? AND is_read = false`,
            [conversationId, userId]
        );

        // Update participant last_read_at
        await this.query(
            `UPDATE conversation_participants 
             SET last_read_at = NOW()
             WHERE conversation_id = ? AND user_id = ?`,
            [conversationId, userId]
        );

        return messages.reverse(); // Return in chronological order
    }

    // Get user's conversations
    static async getUserConversations(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const conversations = await this.query(
            `SELECT c.*,
                    (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as total_messages,
                    (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND receiver_id = ? AND is_read = false) as unread_count,
                    (SELECT m.message_content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
                    (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_time,
                    (SELECT u.first_name FROM conversation_participants cp 
                     INNER JOIN users u ON cp.user_id = u.id 
                     WHERE cp.conversation_id = c.id AND cp.user_id != ? LIMIT 1) as other_participant_name,
                    (SELECT u.profile_image_url FROM conversation_participants cp 
                     INNER JOIN users u ON cp.user_id = u.id 
                     WHERE cp.conversation_id = c.id AND cp.user_id != ? LIMIT 1) as other_participant_image,
                    (SELECT u.id FROM conversation_participants cp 
                     INNER JOIN users u ON cp.user_id = u.id 
                     WHERE cp.conversation_id = c.id AND cp.user_id != ? LIMIT 1) as other_participant_id
             FROM conversations c
             INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
             WHERE cp.user_id = ?
             ORDER BY c.last_message_at DESC
             LIMIT ? OFFSET ?`,
            [userId, userId, userId, userId, userId, limit, offset]
        );

        const [total] = await this.query(
            'SELECT COUNT(*) as count FROM conversation_participants WHERE user_id = ?',
            [userId]
        );

        return {
            data: conversations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Get unread message count
    static async getUnreadCount(userId) {
        const [result] = await this.query(
            `SELECT COUNT(*) as count
             FROM messages m
             INNER JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
             WHERE m.receiver_id = ? AND m.is_read = false AND cp.user_id = ?`,
            [userId, userId]
        );

        return result.count;
    }

    // Mark message as read
    static async markAsRead(messageId, userId) {
        await this.query(
            `UPDATE messages 
             SET is_read = true, read_at = NOW()
             WHERE id = ? AND receiver_id = ?`,
            [messageId, userId]
        );
    }

    // Mark all messages in conversation as read
    static async markConversationAsRead(conversationId, userId) {
        await this.query(
            `UPDATE messages 
             SET is_read = true, read_at = NOW()
             WHERE conversation_id = ? AND receiver_id = ? AND is_read = false`,
            [conversationId, userId]
        );

        await this.query(
            `UPDATE conversation_participants 
             SET last_read_at = NOW()
             WHERE conversation_id = ? AND user_id = ?`,
            [conversationId, userId]
        );
    }

    // Archive conversation
    static async archiveConversation(conversationId, userId) {
        await this.query(
            `UPDATE conversation_participants 
             SET is_muted = true
             WHERE conversation_id = ? AND user_id = ?`,
            [conversationId, userId]
        );
    }

    // Unarchive conversation
    static async unarchiveConversation(conversationId, userId) {
        await this.query(
            `UPDATE conversation_participants 
             SET is_muted = false
             WHERE conversation_id = ? AND user_id = ?`,
            [conversationId, userId]
        );
    }

    // Block conversation
    static async blockConversation(conversationId, userId) {
        await this.query(
            `UPDATE conversations 
             SET status = 'blocked'
             WHERE id = ?`,
            [conversationId]
        );
    }

    // Delete conversation (soft delete for user)
    static async deleteForUser(conversationId, userId) {
        // Remove user from participants (soft delete)
        await this.query(
            'DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, userId]
        );

        // If no participants left, archive conversation
        const [remaining] = await this.query(
            'SELECT COUNT(*) as count FROM conversation_participants WHERE conversation_id = ?',
            [conversationId]
        );

        if (remaining.count === 0) {
            await this.query(
                'UPDATE conversations SET status = "archived" WHERE id = ?',
                [conversationId]
            );
        }
    }

    // Search messages
    static async search(userId, query, page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const messages = await this.query(
            `SELECT m.*, c.id as conversation_id,
                    u.first_name as sender_name,
                    u.profile_image_url as sender_image
             FROM messages m
             INNER JOIN conversations c ON m.conversation_id = c.id
             INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
             INNER JOIN users u ON m.sender_id = u.id
             WHERE cp.user_id = ? 
               AND m.message_content LIKE ?
             ORDER BY m.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, `%${query}%`, limit, offset]
        );

        const [total] = await this.query(
            `SELECT COUNT(*) as count
             FROM messages m
             INNER JOIN conversations c ON m.conversation_id = c.id
             INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
             WHERE cp.user_id = ? AND m.message_content LIKE ?`,
            [userId, `%${query}%`]
        );

        return {
            data: messages,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Get conversation stats
    static async getStats(conversationId) {
        const stats = await this.getOne(
            `SELECT 
                COUNT(*) as total_messages,
                COUNT(DISTINCT sender_id) as participants,
                MIN(created_at) as first_message,
                MAX(created_at) as last_message,
                AVG(LENGTH(message_content)) as avg_message_length
             FROM messages
             WHERE conversation_id = ?`,
            [conversationId]
        );

        return stats;
    }

    // Get user's conversation stats
    static async getUserStats(userId) {
        const stats = await this.getOne(
            `SELECT 
                COUNT(DISTINCT conversation_id) as total_conversations,
                SUM(CASE WHEN sender_id = ? THEN 1 ELSE 0 END) as messages_sent,
                SUM(CASE WHEN receiver_id = ? AND is_read = 0 THEN 1 ELSE 0 END) as unread_received,
                MAX(created_at) as last_message_time
             FROM messages
             WHERE sender_id = ? OR receiver_id = ?`,
            [userId, userId, userId, userId]
        );

        return stats;
    }

    // Get active conversations (for admin)
    static async getActiveConversations(hours = 24) {
        return await this.query(
            `SELECT c.*, 
                    COUNT(m.id) as message_count,
                    MAX(m.created_at) as last_activity
             FROM conversations c
             INNER JOIN messages m ON c.id = m.conversation_id
             WHERE m.created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
             GROUP BY c.id
             ORDER BY last_activity DESC
             LIMIT 50`,
            [hours]
        );
    }

    // Clean up old conversations (cron job)
    static async cleanupOld(days = 90) {
        const oldConversations = await this.query(
            `SELECT id FROM conversations 
             WHERE last_message_at < DATE_SUB(NOW(), INTERVAL ? DAY)
             AND status != 'archived'`,
            [days]
        );

        for (const conv of oldConversations) {
            await this.query(
                'UPDATE conversations SET status = "archived" WHERE id = ?',
                [conv.id]
            );
        }

        return oldConversations.length;
    }

    // Get conversation with related item details
    static async getConversationWithDetails(conversationId, userId) {
        const conversation = await this.getConversation(conversationId, userId);

        if (conversation.related_pet_id) {
            const pet = await this.getOne(
                `SELECT p.*, 
                        (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1) as image
                 FROM pets p
                 WHERE p.id = ?`,
                [conversation.related_pet_id]
            );
            conversation.related_item = pet;
        }

        if (conversation.related_product_id) {
            const product = await this.getOne(
                `SELECT p.*, 
                        (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = 1 LIMIT 1) as image
                 FROM products p
                 WHERE p.id = ?`,
                [conversation.related_product_id]
            );
            conversation.related_item = product;
        }

        return conversation;
    }
}

module.exports = MessageModel;