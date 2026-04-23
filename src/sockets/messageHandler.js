const { query, getOne } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('🔌 New client connected:', socket.id);

        // Authenticate user
        socket.on('authenticate', (userId) => {
            socket.userId = userId;
            socket.join(`user:${userId}`);
            console.log(`👤 User ${userId} authenticated on socket ${socket.id}`);
        });

        // Join conversation room
        socket.on('join_conversation', (conversationId) => {
            socket.join(`conversation:${conversationId}`);
            console.log(`💬 Socket ${socket.id} joined conversation ${conversationId}`);
        });

        // Leave conversation room
        socket.on('leave_conversation', (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
            console.log(`👋 Socket ${socket.id} left conversation ${conversationId}`);
        });

        // Send message
        socket.on('send_message', async (data) => {
            try {
                const { conversationId, receiverId, messageContent } = data;
                const senderId = socket.userId;

                if (!senderId) {
                    socket.emit('error', { message: 'Authentication required' });
                    return;
                }

                // Create message in database
                const messageId = uuidv4();
                await query(
                    `INSERT INTO messages (id, conversation_id, sender_id, receiver_id, message_content, is_read, created_at) 
                     VALUES (?, ?, ?, ?, ?, false, NOW())`,
                    [messageId, conversationId, senderId, receiverId, messageContent]
                );

                // Update conversation last_message_at
                await query(
                    'UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?',
                    [conversationId]
                );

                // Get sender info for notification
                const sender = await getOne(
                    'SELECT id, first_name, last_name, profile_image_url FROM users WHERE id = ?',
                    [senderId]
                );

                const messageData = {
                    id: messageId,
                    conversationId,
                    sender,
                    receiverId,
                    messageContent,
                    isRead: false,
                    createdAt: new Date().toISOString()
                };

                // Emit to conversation room
                io.to(`conversation:${conversationId}`).emit('new_message', messageData);

                // Emit notification to receiver
                io.to(`user:${receiverId}`).emit('message_notification', {
                    conversationId,
                    message: messageData,
                    unreadCount: await getUnreadCount(receiverId)
                });

                console.log(`📨 Message sent in conversation ${conversationId}`);

            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Mark messages as read
        socket.on('mark_read', async (data) => {
            try {
                const { conversationId } = data;
                const userId = socket.userId;

                if (!userId) return;

                // Update messages as read
                await query(
                    `UPDATE messages 
                     SET is_read = true, read_at = NOW() 
                     WHERE conversation_id = ? AND receiver_id = ? AND is_read = false`,
                    [conversationId, userId]
                );

                // Update participant last_read_at
                await query(
                    `UPDATE conversation_participants 
                     SET last_read_at = NOW() 
                     WHERE conversation_id = ? AND user_id = ?`,
                    [conversationId, userId]
                );

                // Notify conversation
                io.to(`conversation:${conversationId}`).emit('messages_read', {
                    conversationId,
                    userId,
                    readAt: new Date().toISOString()
                });

                // Send updated unread count
                const unreadCount = await getUnreadCount(userId);
                io.to(`user:${userId}`).emit('unread_count', { count: unreadCount });

            } catch (error) {
                console.error('Error marking messages as read:', error);
            }
        });

        // Typing indicators
        socket.on('typing_start', (data) => {
            const { conversationId } = data;
            socket.to(`conversation:${conversationId}`).emit('user_typing', {
                userId: socket.userId,
                isTyping: true
            });
        });

        socket.on('typing_end', (data) => {
            const { conversationId } = data;
            socket.to(`conversation:${conversationId}`).emit('user_typing', {
                userId: socket.userId,
                isTyping: false
            });
        });

        // Disconnect
        socket.on('disconnect', () => {
            console.log('🔌 Client disconnected:', socket.id);
        });
    });
};

// Helper function to get unread count
const getUnreadCount = async (userId) => {
    const result = await getOne(
        `SELECT COUNT(*) as count 
         FROM messages m
         JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
         WHERE m.receiver_id = ? AND m.is_read = false AND cp.user_id = ?`,
        [userId, userId]
    );
    return result?.count || 0;
};