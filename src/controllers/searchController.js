// src/controllers/searchController.js
const PetModel = require('../models/petModel');
const ProductModel = require('../models/productModel');
const BreedModel = require('../models/breedModel');
const BlogModel = require('../models/blogModel');
const GuideModel = require('../models/guideModel');
const UserModel = require('../models/userModel');
const AnalyticsModel = require('../models/analyticsModel');

// Global search across all types
const globalSearch = async (req, res) => {
    try {
        const {
            q,
            type = 'all',
            page = 1,
            limit = 20,
            sort_by = 'relevance',
            sort_order = 'DESC'
        } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query must be at least 2 characters'
            });
    }

        const searchTerm = q.trim();
        const results = {};
        const pagination = {};

        // Search based on type
        if (type === 'all' || type === 'pets') {
            const petResult = await PetModel.findAll(
                { search: searchTerm, status: 'available' },
                page,
                limit
            );
            results.pets = petResult.data;
            pagination.pets = petResult.pagination;
        }

        if (type === 'all' || type === 'products') {
            const productResult = await ProductModel.findAll(
                { search: searchTerm, status: 'active' },
                page,
                limit
            );
            results.products = productResult.data;
            pagination.products = productResult.pagination;
        }

        if (type === 'all' || type === 'breeds') {
            const breedResult = await BreedModel.findAll(
                { search: searchTerm },
                page,
                limit
            );
            results.breeds = breedResult.data;
            pagination.breeds = breedResult.pagination;
        }

        if (type === 'all' || type === 'blog') {
            const blogResult = await BlogModel.findAll(
                { search: searchTerm, status: 'published' },
                page,
                limit
            );
            results.blog = blogResult.data;
            pagination.blog = blogResult.pagination;
        }

        if (type === 'all' || type === 'guides') {
            const guideResult = await GuideModel.findAll(
                { search: searchTerm, status: 'published' },
                page,
                limit
            );
            results.guides = guideResult.data;
            pagination.guides = guideResult.pagination;
        }

        if (type === 'all' || type === 'users') {
            // Only show public user info
            const userResult = await UserModel.getAllUsers(page, limit);
            results.users = userResult.users.map(u => ({
                id: u.id,
                name: `${u.first_name} ${u.last_name}`,
                avatar: u.profile_image_url,
                store_name: u.store_name,
                seller_rating: u.seller_rating
            }));
            pagination.users = userResult.pagination;
        }

        // Track search for analytics
        await AnalyticsModel.trackSearch(
            req.user?.id,
            req.session?.id,
            searchTerm,
            { type },
            Object.values(results).flat().length
        );

        // Get search suggestions for next time
        const suggestions = await getSearchSuggestions(searchTerm);

        res.json({
            success: true,
            query: searchTerm,
            type,
            results,
            pagination,
            suggestions,
            total_results: Object.values(results).flat().length
        });
    } catch (error) {
        console.error('Global search error:', error);
        res.status(500).json({
            success: false,
            error: 'Search failed'
        });
    }
};

// Advanced search with filters
const advancedSearch = async (req, res) => {
    try {
        const {
            q,
            type = 'pets',
            page = 1,
            limit = 20,
            filters = {}
        } = req.body;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query must be at least 2 characters'
            });
        }

        let results = {};
        let pagination = {};

        switch (type) {
            case 'pets':
                const petResult = await PetModel.findAll(
                    {
                        search: q,
                        ...filters,
                        status: 'available'
                    },
                    page,
                    limit
                );
                results = petResult.data;
                pagination = petResult.pagination;
                break;

            case 'products':
                const productResult = await ProductModel.findAll(
                    {
                        search: q,
                        ...filters,
                        status: 'active'
                    },
                    page,
                    limit
                );
                results = productResult.data;
                pagination = productResult.pagination;
                break;

            case 'breeds':
                const breedResult = await BreedModel.findAll(
                    { search: q, ...filters },
                    page,
                    limit
                );
                results = breedResult.data;
                pagination = breedResult.pagination;
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid search type'
                });
        }

        // Track search
        await AnalyticsModel.trackSearch(
            req.user?.id,
            req.session?.id,
            q,
            { type, filters },
            results.length
        );

        res.json({
            success: true,
            query: q,
            type,
            filters,
            data: results,
            pagination
        });
    } catch (error) {
        console.error('Advanced search error:', error);
        res.status(500).json({
            success: false,
            error: 'Advanced search failed'
        });
    }
};

// Get search suggestions (autocomplete)
const getSuggestions = async (req, res) => {
    try {
        const { q, type = 'all' } = req.query;

        if (!q || q.trim().length < 2) {
            return res.json({
                success: true,
                suggestions: []
            });
        }

        const searchTerm = q.trim();
        const suggestions = [];

        // Get suggestions from different sources
        if (type === 'all' || type === 'pets') {
            const petSuggestions = await PetModel.query(
                `SELECT DISTINCT name as text, 'pet' as type 
                 FROM pets 
                 WHERE name LIKE ? AND status = 'available'
                 LIMIT 5`,
                [`${searchTerm}%`]
            );
            suggestions.push(...petSuggestions);
        }

        if (type === 'all' || type === 'products') {
            const productSuggestions = await ProductModel.query(
                `SELECT DISTINCT name as text, 'product' as type 
                 FROM products 
                 WHERE name LIKE ? AND status = 'active'
                 LIMIT 5`,
                [`${searchTerm}%`]
            );
            suggestions.push(...productSuggestions);
        }

        if (type === 'all' || type === 'breeds') {
            const breedSuggestions = await BreedModel.query(
                `SELECT name as text, 'breed' as type 
                 FROM breeds 
                 WHERE name LIKE ?
                 LIMIT 5`,
                [`${searchTerm}%`]
            );
            suggestions.push(...breedSuggestions);
        }

        if (type === 'all' || type === 'blog') {
            const blogSuggestions = await BlogModel.query(
                `SELECT title as text, 'blog' as type 
                 FROM blog_posts 
                 WHERE title LIKE ? AND status = 'published'
                 LIMIT 3`,
                [`${searchTerm}%`]
            );
            suggestions.push(...blogSuggestions);
        }

        if (type === 'all' || type === 'guides') {
            const guideSuggestions = await GuideModel.query(
                `SELECT title as text, 'guide' as type 
                 FROM guides 
                 WHERE title LIKE ? AND status = 'published'
                 LIMIT 3`,
                [`${searchTerm}%`]
            );
            suggestions.push(...guideSuggestions);
        }

        // Sort by relevance (exact matches first)
        suggestions.sort((a, b) => {
            const aExact = a.text.toLowerCase().startsWith(searchTerm.toLowerCase()) ? 1 : 0;
            const bExact = b.text.toLowerCase().startsWith(searchTerm.toLowerCase()) ? 1 : 0;
            return bExact - aExact;
        });

        res.json({
            success: true,
            query: searchTerm,
            suggestions: suggestions.slice(0, 10)
        });
    } catch (error) {
        console.error('Get suggestions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get suggestions'
        });
    }
};

// Get popular searches
const getPopularSearches = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        // Get popular searches from analytics
        const popular = await AnalyticsModel.getSearchAnalytics('30d');

        res.json({
            success: true,
            data: popular.popular_searches.slice(0, limit)
        });
    } catch (error) {
        console.error('Get popular searches error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get popular searches'
        });
    }
};

// Get recent searches for user
const getRecentSearches = async (req, res) => {
    try {
        if (!req.user) {
            return res.json({
                success: true,
                data: []
            });
        }

        // Get user's recent searches from analytics
        const recent = await AnalyticsModel.query(
            `SELECT DISTINCT 
                JSON_EXTRACT(metadata, '$.query') as query,
                MAX(timestamp) as last_searched
             FROM analytics_events
             WHERE user_id = ? AND event_type = 'search'
             GROUP BY JSON_EXTRACT(metadata, '$.query')
             ORDER BY last_searched DESC
             LIMIT 10`,
            [req.user.id]
        );

        res.json({
            success: true,
            data: recent.map(r => ({
                query: r.query.replace(/"/g, ''),
                last_searched: r.last_searched
            }))
        });
    } catch (error) {
        console.error('Get recent searches error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get recent searches'
        });
    }
};

// Save search for later
const saveSearch = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Login required to save searches'
            });
        }

        const { query, filters, name } = req.body;

        // Save to database (you'd need a saved_searches table)
        // This is a placeholder
        const savedSearch = {
            id: Date.now(),
            user_id: req.user.id,
            name: name || query,
            query,
            filters,
            created_at: new Date()
        };

        res.json({
            success: true,
            message: 'Search saved successfully',
            data: savedSearch
        });
    } catch (error) {
        console.error('Save search error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save search'
        });
    }
};

// Get saved searches
const getSavedSearches = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Login required'
            });
        }

        // Get from database (you'd need a saved_searches table)
        // This is a placeholder
        const savedSearches = [];

        res.json({
            success: true,
            data: savedSearches
        });
    } catch (error) {
        console.error('Get saved searches error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get saved searches'
        });
    }
};

// Delete saved search
const deleteSavedSearch = async (req, res) => {
    try {
        const { id } = req.params;

        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Login required'
            });
        }

        // Delete from database
        // This is a placeholder

        res.json({
            success: true,
            message: 'Saved search deleted'
        });
    } catch (error) {
        console.error('Delete saved search error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete saved search'
        });
    }
};

// Clear search history
const clearSearchHistory = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Login required'
            });
        }

        // Delete user's search history from analytics
        await AnalyticsModel.query(
            'DELETE FROM analytics_events WHERE user_id = ? AND event_type = "search"',
            [req.user.id]
        );

        res.json({
            success: true,
            message: 'Search history cleared'
        });
    } catch (error) {
        console.error('Clear search history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear search history'
        });
    }
};

// Helper function to get search suggestions
const getSearchSuggestions = async (query) => {
    try {
        const suggestions = [];

        // Get related searches from analytics
        const related = await AnalyticsModel.query(
            `SELECT DISTINCT 
                JSON_EXTRACT(metadata, '$.query') as related_query,
                COUNT(*) as frequency
             FROM analytics_events
             WHERE event_type = 'search'
               AND JSON_EXTRACT(metadata, '$.query') LIKE ?
               AND JSON_EXTRACT(metadata, '$.query') != ?
             GROUP BY JSON_EXTRACT(metadata, '$.query')
             ORDER BY frequency DESC
             LIMIT 5`,
            [`%${query}%`, query]
        );

        suggestions.push(...related.map(r => ({
            text: r.related_query.replace(/"/g, ''),
            type: 'related'
        })));

        return suggestions;
    } catch (error) {
        console.error('Get search suggestions error:', error);
        return [];
    }
};

// Search by location
const searchByLocation = async (req, res) => {
    try {
        const {
            lat, lng, radius = 10, // radius in km
            type = 'pets',
            page = 1,
            limit = 20
        } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude required'
            });
        }

        let results = [];

        if (type === 'pets') {
            // Simple location search (you'd need spatial queries for production)
            results = await PetModel.query(
                `SELECT p.*, 
                    (SELECT image_url FROM pet_images WHERE pet_id = p.id AND is_primary = 1 LIMIT 1) as image,
                    u.first_name as seller_name,
                    (6371 * acos(cos(radians(?)) * cos(radians(p.lat)) * 
                     cos(radians(p.lng) - radians(?)) + sin(radians(?)) * 
                     sin(radians(p.lat)))) AS distance
                 FROM pets p
                 LEFT JOIN users u ON p.seller_id = u.id
                 WHERE p.status = 'available'
                 HAVING distance < ?
                 ORDER BY distance
                 LIMIT ? OFFSET ?`,
                [lat, lng, lat, radius, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]
            );
        }

        res.json({
            success: true,
            location: { lat, lng, radius },
            type,
            data: results,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: results.length
            }
        });
    } catch (error) {
        console.error('Search by location error:', error);
        res.status(500).json({
            success: false,
            error: 'Location search failed'
        });
    }
};

// Voice search (simplified)
const voiceSearch = async (req, res) => {
    try {
        const { transcript } = req.body;

        if (!transcript) {
            return res.status(400).json({
                success: false,
                error: 'No voice input received'
            });
        }

        // Process voice transcript (simplified)
        // In production, you'd use NLP to extract intent and entities
        const searchQuery = transcript.toLowerCase();

        // Extract potential filters from voice
        const filters = {};
        
        if (searchQuery.includes('dog') || searchQuery.includes('puppy')) {
            filters.category = 'dog';
        }
        if (searchQuery.includes('cat') || searchQuery.includes('kitten')) {
            filters.category = 'cat';
        }
        if (searchQuery.includes('under')) {
            const priceMatch = searchQuery.match(/under (\d+)/);
            if (priceMatch) {
                filters.max_price = parseInt(priceMatch[1]);
            }
        }

        // Perform search
        const results = await PetModel.findAll(
            {
                search: searchQuery,
                ...filters,
                status: 'available'
            },
            1,
            20
        );

        res.json({
            success: true,
            voice_input: transcript,
            interpreted_as: searchQuery,
            filters_applied: filters,
            results: results.data
        });
    } catch (error) {
        console.error('Voice search error:', error);
        res.status(500).json({
            success: false,
            error: 'Voice search failed'
        });
    }
};

// Image search (simplified - would need ML integration)
const imageSearch = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image provided'
            });
        }

        // In production, you'd use image recognition to identify the pet/breed
        // This is a simplified placeholder
        const imageUrl = `/uploads/temp/${req.file.filename}`;

        // Mock result based on filename (in production, use ML)
        const mockBreed = req.file.originalname.includes('dog') ? 'dog' : 'cat';

        const results = await PetModel.findAll(
            {
                category: mockBreed,
                status: 'available'
            },
            1,
            20
        );

        res.json({
            success: true,
            image_analyzed: imageUrl,
            detected_type: mockBreed,
            results: results.data
        });
    } catch (error) {
        console.error('Image search error:', error);
        res.status(500).json({
            success: false,
            error: 'Image search failed'
        });
    }
};

module.exports = {
    globalSearch,
    advancedSearch,
    getSuggestions,
    getPopularSearches,
    getRecentSearches,
    saveSearch,
    getSavedSearches,
    deleteSavedSearch,
    clearSearchHistory,
    searchByLocation,
    voiceSearch,
    imageSearch
};