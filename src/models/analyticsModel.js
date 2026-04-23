// src/models/analyticsModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class AnalyticsModel extends DB {
    // Track an event
    static async trackEvent(eventData) {
        const {
            event_type, user_id = null, session_id = null,
            target_type = null, target_id = null,
            metadata = {}, ip_address = null, user_agent = null
        } = eventData;

        const id = uuidv4();

        await this.query(
            `INSERT INTO analytics_events (
                id, event_type, user_id, session_id, target_type,
                target_id, metadata, ip_address, user_agent, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [id, event_type, user_id, session_id, target_type,
             target_id, JSON.stringify(metadata), ip_address, user_agent]
        );

        return id;
    }

    // Track page view
    static async trackPageView(userId, sessionId, page, metadata = {}) {
        return await this.trackEvent({
            event_type: 'page_view',
            user_id: userId,
            session_id: sessionId,
            metadata: { page, ...metadata }
        });
    }

    // Track pet view
    static async trackPetView(userId, sessionId, petId, metadata = {}) {
        return await this.trackEvent({
            event_type: 'pet_view',
            user_id: userId,
            session_id: sessionId,
            target_type: 'pet',
            target_id: petId,
            metadata
        });
    }

    // Track product view
    static async trackProductView(userId, sessionId, productId, metadata = {}) {
        return await this.trackEvent({
            event_type: 'product_view',
            user_id: userId,
            session_id: sessionId,
            target_type: 'product',
            target_id: productId,
            metadata
        });
    }

    // Track search
    static async trackSearch(userId, sessionId, query, filters = {}, resultsCount = 0) {
        return await this.trackEvent({
            event_type: 'search',
            user_id: userId,
            session_id: sessionId,
            metadata: { query, filters, results_count: resultsCount }
        });
    }

    // Track message sent
    static async trackMessage(userId, sessionId, conversationId, receiverId) {
        return await this.trackEvent({
            event_type: 'message_sent',
            user_id: userId,
            session_id: sessionId,
            metadata: { conversation_id: conversationId, receiver_id: receiverId }
        });
    }

    // Track favorite added
    static async trackFavorite(userId, sessionId, itemType, itemId) {
        return await this.trackEvent({
            event_type: 'favorite_added',
            user_id: userId,
            session_id: sessionId,
            target_type: itemType,
            target_id: itemId
        });
    }

    // Get page view statistics
    static async getPageViews(period = '30d', groupBy = 'day') {
        let interval = '';
        switch(period) {
            case '24h':
                interval = 'INTERVAL 24 HOUR';
                break;
            case '7d':
                interval = 'INTERVAL 7 DAY';
                break;
            case '30d':
                interval = 'INTERVAL 30 DAY';
                break;
            case '90d':
                interval = 'INTERVAL 90 DAY';
                break;
        }

        let groupFormat = '';
        switch(groupBy) {
            case 'hour':
                groupFormat = '%Y-%m-%d %H:00';
                break;
            case 'day':
                groupFormat = '%Y-%m-%d';
                break;
            case 'month':
                groupFormat = '%Y-%m';
                break;
        }

        return await this.query(
            `SELECT 
                DATE_FORMAT(timestamp, ?) as time_period,
                COUNT(*) as total_views,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT session_id) as unique_sessions,
                JSON_EXTRACT(metadata, '$.page') as page
             FROM analytics_events
             WHERE event_type = 'page_view'
               AND timestamp >= DATE_SUB(NOW(), ${interval})
             GROUP BY DATE_FORMAT(timestamp, ?), JSON_EXTRACT(metadata, '$.page')
             ORDER BY time_period DESC`,
            [groupFormat, groupFormat]
        );
    }

    // Get pet view statistics for seller
    static async getPetViews(sellerId, period = '30d') {
        let interval = '';
        switch(period) {
            case '7d':
                interval = 'INTERVAL 7 DAY';
                break;
            case '30d':
                interval = 'INTERVAL 30 DAY';
                break;
            case '90d':
                interval = 'INTERVAL 90 DAY';
                break;
        }

        // Update seller analytics daily table
        await this.updateSellerDailyStats(sellerId);

        // Get aggregated stats
        const stats = await this.getOne(
            `SELECT 
                SUM(profile_views) as total_profile_views,
                SUM(pet_views) as total_pet_views,
                SUM(message_count) as total_messages,
                SUM(favorite_count) as total_favorites,
                AVG(conversion_rate) as avg_conversion_rate
             FROM seller_analytics_daily
             WHERE seller_id = ? AND date >= DATE_SUB(CURDATE(), ${interval})`,
            [sellerId]
        );

        // Get daily breakdown
        const daily = await this.query(
            `SELECT 
                date,
                profile_views,
                pet_views,
                message_count,
                favorite_count,
                inquiry_count,
                conversion_rate,
                revenue
             FROM seller_analytics_daily
             WHERE seller_id = ? AND date >= DATE_SUB(CURDATE(), ${interval})
             ORDER BY date DESC`,
            [sellerId]
        );

        // Get top performing pets
        const topPets = await this.query(
            `SELECT 
                p.id, p.name,
                COUNT(a.id) as view_count
             FROM analytics_events a
             INNER JOIN pets p ON a.target_id = p.id
             WHERE a.event_type = 'pet_view'
               AND a.target_type = 'pet'
               AND p.seller_id = ?
               AND a.timestamp >= DATE_SUB(NOW(), ${interval})
             GROUP BY p.id, p.name
             ORDER BY view_count DESC
             LIMIT 10`,
            [sellerId]
        );

        return {
            summary: stats,
            daily,
            top_pets: topPets
        };
    }

    // Update seller daily analytics (run daily via cron)
    static async updateSellerDailyStats(sellerId = null) {
        let sql = `
            INSERT INTO seller_analytics_daily (
                seller_id, date, profile_views, pet_views,
                message_count, favorite_count, inquiry_count,
                conversion_rate, revenue
            )
            SELECT 
                u.id as seller_id,
                CURDATE() as date,
                COALESCE(profile_views.profile_views, 0) as profile_views,
                COALESCE(pet_views.pet_views, 0) as pet_views,
                COALESCE(messages.message_count, 0) as message_count,
                COALESCE(favorites.favorite_count, 0) as favorite_count,
                COALESCE(inquiries.inquiry_count, 0) as inquiry_count,
                0 as conversion_rate,
                COALESCE(revenue.daily_revenue, 0) as revenue
            FROM users u
            LEFT JOIN (
                SELECT 
                    user_id,
                    COUNT(*) as profile_views
                FROM analytics_events
                WHERE event_type = 'page_view'
                  AND DATE(timestamp) = CURDATE()
                  AND JSON_EXTRACT(metadata, '$.page') = 'seller_profile'
                GROUP BY user_id
            ) profile_views ON u.id = profile_views.user_id
            LEFT JOIN (
                SELECT 
                    p.seller_id,
                    COUNT(a.id) as pet_views
                FROM analytics_events a
                INNER JOIN pets p ON a.target_id = p.id
                WHERE a.event_type = 'pet_view'
                  AND a.target_type = 'pet'
                  AND DATE(a.timestamp) = CURDATE()
                GROUP BY p.seller_id
            ) pet_views ON u.id = pet_views.seller_id
            LEFT JOIN (
                SELECT 
                    receiver_id as user_id,
                    COUNT(*) as message_count
                FROM messages
                WHERE DATE(created_at) = CURDATE()
                GROUP BY receiver_id
            ) messages ON u.id = messages.user_id
            LEFT JOIN (
                SELECT 
                    user_id,
                    COUNT(*) as favorite_count
                FROM favorites
                WHERE DATE(created_at) = CURDATE()
                GROUP BY user_id
            ) favorites ON u.id = favorites.user_id
            LEFT JOIN (
                SELECT 
                    p.seller_id,
                    COUNT(m.id) as inquiry_count
                FROM messages m
                INNER JOIN conversations c ON m.conversation_id = c.id
                INNER JOIN pets p ON c.related_pet_id = p.id
                WHERE DATE(m.created_at) = CURDATE()
                GROUP BY p.seller_id
            ) inquiries ON u.id = inquiries.seller_id
            LEFT JOIN (
                SELECT 
                    oi.seller_id,
                    SUM(oi.total_price) as daily_revenue
                FROM order_items oi
                INNER JOIN orders o ON oi.order_id = o.id
                WHERE DATE(o.created_at) = CURDATE()
                  AND o.status = 'delivered'
                GROUP BY oi.seller_id
            ) revenue ON u.id = revenue.seller_id
            WHERE u.role != 'admin'
        `;

        if (sellerId) {
            sql += ` AND u.id = ${sellerId}`;
        }

        sql += ` ON DUPLICATE KEY UPDATE
            profile_views = VALUES(profile_views),
            pet_views = VALUES(pet_views),
            message_count = VALUES(message_count),
            favorite_count = VALUES(favorite_count),
            inquiry_count = VALUES(inquiry_count),
            revenue = VALUES(revenue)`;

        await this.query(sql);
    }

    // Get search analytics
    static async getSearchAnalytics(period = '30d') {
        let interval = '';
        switch(period) {
            case '7d':
                interval = 'INTERVAL 7 DAY';
                break;
            case '30d':
                interval = 'INTERVAL 30 DAY';
                break;
            case '90d':
                interval = 'INTERVAL 90 DAY';
                break;
        }

        // Popular search queries
        const popularSearches = await this.query(
            `SELECT 
                JSON_EXTRACT(metadata, '$.query') as query,
                COUNT(*) as search_count,
                AVG(JSON_EXTRACT(metadata, '$.results_count')) as avg_results
             FROM analytics_events
             WHERE event_type = 'search'
               AND timestamp >= DATE_SUB(NOW(), ${interval})
             GROUP BY JSON_EXTRACT(metadata, '$.query')
             ORDER BY search_count DESC
             LIMIT 20`,
            []
        );

        // Searches over time
        const searchesOverTime = await this.query(
            `SELECT 
                DATE(timestamp) as date,
                COUNT(*) as search_count,
                COUNT(DISTINCT user_id) as unique_users
             FROM analytics_events
             WHERE event_type = 'search'
               AND timestamp >= DATE_SUB(NOW(), ${interval})
             GROUP BY DATE(timestamp)
             ORDER BY date DESC`,
            []
        );

        // Search with no results
        const noResults = await this.query(
            `SELECT 
                JSON_EXTRACT(metadata, '$.query') as query,
                COUNT(*) as count
             FROM analytics_events
             WHERE event_type = 'search'
               AND JSON_EXTRACT(metadata, '$.results_count') = 0
               AND timestamp >= DATE_SUB(NOW(), ${interval})
             GROUP BY JSON_EXTRACT(metadata, '$.query')
             ORDER BY count DESC
             LIMIT 10`,
            []
        );

        return {
            popular_searches: popularSearches,
            searches_over_time: searchesOverTime,
            searches_with_no_results: noResults,
            total_searches: popularSearches.reduce((sum, s) => sum + s.search_count, 0)
        };
    }

    // Get user behavior analytics
    static async getUserBehavior(period = '30d') {
        let interval = '';
        switch(period) {
            case '7d':
                interval = 'INTERVAL 7 DAY';
                break;
            case '30d':
                interval = 'INTERVAL 30 DAY';
                break;
            case '90d':
                interval = 'INTERVAL 90 DAY';
                break;
        }

        // New vs returning users
        const userTypes = await this.query(
            `SELECT 
                CASE 
                    WHEN COUNT(*) OVER (PARTITION BY user_id) > 1 THEN 'returning'
                    ELSE 'new'
                END as user_type,
                COUNT(DISTINCT user_id) as user_count
             FROM analytics_events
             WHERE timestamp >= DATE_SUB(NOW(), ${interval})
               AND user_id IS NOT NULL
             GROUP BY user_type`,
            []
        );

        // Average session duration (simplified)
        const sessions = await this.query(
            `SELECT 
                session_id,
                MIN(timestamp) as session_start,
                MAX(timestamp) as session_end
             FROM analytics_events
             WHERE timestamp >= DATE_SUB(NOW(), ${interval})
               AND session_id IS NOT NULL
             GROUP BY session_id`,
            []
        );

        let totalDuration = 0;
        sessions.forEach(s => {
            const duration = (new Date(s.session_end) - new Date(s.session_start)) / 1000 / 60; // minutes
            totalDuration += duration;
        });

        const avgSessionDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;

        // Events per user
        const eventsPerUser = await this.query(
            `SELECT 
                user_id,
                COUNT(*) as event_count
             FROM analytics_events
             WHERE timestamp >= DATE_SUB(NOW(), ${interval})
               AND user_id IS NOT NULL
             GROUP BY user_id`,
            []
        );

        const avgEventsPerUser = eventsPerUser.length > 0
            ? eventsPerUser.reduce((sum, e) => sum + e.event_count, 0) / eventsPerUser.length
            : 0;

        return {
            user_types: userTypes,
            avg_session_duration_minutes: avgSessionDuration,
            avg_events_per_user: avgEventsPerUser,
            total_sessions: sessions.length,
            unique_users: eventsPerUser.length
        };
    }

    // Get conversion funnel
    static async getConversionFunnel(period = '30d') {
        let interval = '';
        switch(period) {
            case '7d':
                interval = 'INTERVAL 7 DAY';
                break;
            case '30d':
                interval = 'INTERVAL 30 DAY';
                break;
            case '90d':
                interval = 'INTERVAL 90 DAY';
                break;
        }

        const funnel = {
            stages: []
        };

        // Stage 1: Page views
        const pageViews = await this.getOne(
            `SELECT COUNT(*) as count
             FROM analytics_events
             WHERE event_type = 'page_view'
               AND timestamp >= DATE_SUB(NOW(), ${interval})`,
            []
        );
        funnel.stages.push({ name: 'Visitors', count: pageViews.count });

        // Stage 2: Pet/Product views
        const itemViews = await this.getOne(
            `SELECT COUNT(*) as count
             FROM analytics_events
             WHERE event_type IN ('pet_view', 'product_view')
               AND timestamp >= DATE_SUB(NOW(), ${interval})`,
            []
        );
        funnel.stages.push({ 
            name: 'Interest', 
            count: itemViews.count,
            conversion_rate: (itemViews.count / pageViews.count * 100).toFixed(1)
        });

        // Stage 3: Messages sent
        const messages = await this.getOne(
            `SELECT COUNT(*) as count
             FROM analytics_events
             WHERE event_type = 'message_sent'
               AND timestamp >= DATE_SUB(NOW(), ${interval})`,
            []
        );
        funnel.stages.push({ 
            name: 'Contact', 
            count: messages.count,
            conversion_rate: (messages.count / itemViews.count * 100).toFixed(1)
        });

        // Stage 4: Favorites added
        const favorites = await this.getOne(
            `SELECT COUNT(*) as count
             FROM analytics_events
             WHERE event_type = 'favorite_added'
               AND timestamp >= DATE_SUB(NOW(), ${interval})`,
            []
        );
        funnel.stages.push({ 
            name: 'Interest Saved', 
            count: favorites.count,
            conversion_rate: (favorites.count / messages.count * 100).toFixed(1)
        });

        // Stage 5: Orders placed
        const orders = await this.getOne(
            `SELECT COUNT(*) as count
             FROM orders
             WHERE created_at >= DATE_SUB(NOW(), ${interval})`,
            []
        );
        funnel.stages.push({ 
            name: 'Purchase', 
            count: orders.count,
            conversion_rate: (orders.count / favorites.count * 100).toFixed(1)
        });

        return funnel;
    }

    // Get real-time analytics
    static async getRealtime() {
        const now = new Date();
        const fiveMinAgo = new Date(now - 5 * 60 * 1000);
        const oneHourAgo = new Date(now - 60 * 60 * 1000);

        // Active users in last 5 minutes
        const activeUsers = await this.getOne(
            `SELECT COUNT(DISTINCT 
                CASE 
                    WHEN user_id IS NOT NULL THEN user_id 
                    ELSE session_id 
                END
             ) as count
             FROM analytics_events
             WHERE timestamp >= ?`,
            [fiveMinAgo.toISOString().slice(0, 19).replace('T', ' ')]
        );

        // Page views in last hour
        const pageViews = await this.getOne(
            `SELECT COUNT(*) as count
             FROM analytics_events
             WHERE event_type = 'page_view'
               AND timestamp >= ?`,
            [oneHourAgo.toISOString().slice(0, 19).replace('T', ' ')]
        );

        // Current popular pages
        const popularPages = await this.query(
            `SELECT 
                JSON_EXTRACT(metadata, '$.page') as page,
                COUNT(*) as views
             FROM analytics_events
             WHERE event_type = 'page_view'
               AND timestamp >= ?
             GROUP BY JSON_EXTRACT(metadata, '$.page')
             ORDER BY views DESC
             LIMIT 10`,
            [oneHourAgo.toISOString().slice(0, 19).replace('T', ' ')]
        );

        return {
            active_users: activeUsers.count,
            page_views_last_hour: pageViews.count,
            popular_pages: popularPages,
            timestamp: now
        };
    }

    // Get dashboard overview
    static async getDashboardOverview(period = '30d') {
        const [
            pageViews,
            uniqueVisitors,
            bounceRate,
            conversionRate
        ] = await Promise.all([
            this.getPageViews(period),
            this.getUniqueVisitors(period),
            this.getBounceRate(period),
            this.getConversionRate(period)
        ]);

        return {
            page_views: pageViews.reduce((sum, d) => sum + d.total_views, 0),
            unique_visitors: uniqueVisitors,
            bounce_rate: bounceRate,
            conversion_rate: conversionRate,
            chart_data: pageViews
        };
    }

    // Get unique visitors
    static async getUniqueVisitors(period = '30d') {
        let interval = '';
        switch(period) {
            case '7d':
                interval = 'INTERVAL 7 DAY';
                break;
            case '30d':
                interval = 'INTERVAL 30 DAY';
                break;
            case '90d':
                interval = 'INTERVAL 90 DAY';
                break;
        }

        const [result] = await this.query(
            `SELECT COUNT(DISTINCT 
                CASE 
                    WHEN user_id IS NOT NULL THEN user_id 
                    ELSE session_id 
                END
             ) as count
             FROM analytics_events
             WHERE timestamp >= DATE_SUB(NOW(), ${interval})`,
            []
        );

        return result.count;
    }

    // Get bounce rate (simplified - users who viewed only one page)
    static async getBounceRate(period = '30d') {
        let interval = '';
        switch(period) {
            case '7d':
                interval = 'INTERVAL 7 DAY';
                break;
            case '30d':
                interval = 'INTERVAL 30 DAY';
                break;
            case '90d':
                interval = 'INTERVAL 90 DAY';
                break;
        }

        const sessions = await this.query(
            `SELECT 
                session_id,
                COUNT(*) as page_views
             FROM analytics_events
             WHERE event_type = 'page_view'
               AND timestamp >= DATE_SUB(NOW(), ${interval})
               AND session_id IS NOT NULL
             GROUP BY session_id`,
            []
        );

        const totalSessions = sessions.length;
        const bouncedSessions = sessions.filter(s => s.page_views === 1).length;

        return totalSessions > 0 ? (bouncedSessions / totalSessions * 100).toFixed(1) : 0;
    }

    // Get conversion rate (visitors to orders)
    static async getConversionRate(period = '30d') {
        let interval = '';
        switch(period) {
            case '7d':
                interval = 'INTERVAL 7 DAY';
                break;
            case '30d':
                interval = 'INTERVAL 30 DAY';
                break;
            case '90d':
                interval = 'INTERVAL 90 DAY';
                break;
        }

        const visitors = await this.getUniqueVisitors(period);

        const [orders] = await this.query(
            `SELECT COUNT(DISTINCT buyer_id) as buyers
             FROM orders
             WHERE created_at >= DATE_SUB(NOW(), ${interval})`,
            []
        );

        return visitors > 0 ? (orders.buyers / visitors * 100).toFixed(1) : 0;
    }

    // Export analytics data
    static async exportData(startDate, endDate) {
        const events = await this.query(
            `SELECT 
                event_type,
                user_id,
                session_id,
                target_type,
                target_id,
                metadata,
                timestamp
             FROM analytics_events
             WHERE DATE(timestamp) BETWEEN ? AND ?
             ORDER BY timestamp DESC`,
            [startDate, endDate]
        );

        return {
            period: { start: startDate, end: endDate },
            total_events: events.length,
            events
        };
    }

    // Clean up old analytics data (GDPR compliance)
    static async cleanupOldData(days = 365) {
        const result = await this.query(
            'DELETE FROM analytics_events WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [days]
        );

        return result.affectedRows;
    }

    // Get device/browser stats
    static async getDeviceStats(period = '30d') {
        let interval = '';
        switch(period) {
            case '7d':
                interval = 'INTERVAL 7 DAY';
                break;
            case '30d':
                interval = 'INTERVAL 30 DAY';
                break;
            case '90d':
                interval = 'INTERVAL 90 DAY';
                break;
        }

        // Parse user agent (simplified - in production use a proper UA parser)
        const devices = await this.query(
            `SELECT 
                CASE 
                    WHEN user_agent LIKE '%Mobile%' THEN 'Mobile'
                    WHEN user_agent LIKE '%Tablet%' THEN 'Tablet'
                    ELSE 'Desktop'
                END as device_type,
                COUNT(*) as count
             FROM analytics_events
             WHERE timestamp >= DATE_SUB(NOW(), ${interval})
               AND user_agent IS NOT NULL
             GROUP BY device_type`,
            []
        );

        return devices;
    }
}

module.exports = AnalyticsModel;