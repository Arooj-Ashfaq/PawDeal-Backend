// src/controllers/favoriteController.js
const FavoriteModel = require('../models/favoriteModel');
const PetModel = require('../models/petModel');
const ProductModel = require('../models/productModel');

// Get user's favorites
const getFavorites = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, type = 'all' } = req.query;

        let result;

        if (type === 'pets') {
            result = await FavoriteModel.getUserPets(userId, page, limit);
        } else if (type === 'products') {
            result = await FavoriteModel.getUserProducts(userId, page, limit);
        } else {
            result = await FavoriteModel.getAllUserFavorites(userId, page, limit);
        }

        // Get counts
        const counts = await FavoriteModel.getCounts(userId);

        res.json({
            success: true,
            data: result.data,
            pagination: result.pagination,
            counts
        });
    } catch (error) {
        console.error('Get favorites error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch favorites'
        });
    }
};

// Add item to favorites
const addFavorite = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, id } = req.params;

        if (!['pet', 'product'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid favorite type. Must be "pet" or "product"'
            });
        }

        // Verify item exists
        if (type === 'pet') {
            const pet = await PetModel.findById(id);
            if (!pet) {
                return res.status(404).json({
                    success: false,
                    error: 'Pet not found'
                });
            }
        } else {
            const product = await ProductModel.findById(id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found'
                });
            }
        }

        const added = await FavoriteModel.add(userId, type, id);

        if (added) {
            // Get updated counts
            const counts = await FavoriteModel.getCounts(userId);

            res.json({
                success: true,
                message: 'Added to favorites',
                counts
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Item already in favorites'
            });
        }
    } catch (error) {
        console.error('Add favorite error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add to favorites'
        });
    }
};

// Remove item from favorites
const removeFavorite = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, id } = req.params;

        if (!['pet', 'product'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid favorite type. Must be "pet" or "product"'
            });
        }

        await FavoriteModel.remove(userId, type, id);

        // Get updated counts
        const counts = await FavoriteModel.getCounts(userId);

        res.json({
            success: true,
            message: 'Removed from favorites',
            counts
        });
    } catch (error) {
        console.error('Remove favorite error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove from favorites'
        });
    }
};

// Check if item is favorited
const checkFavorite = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, id } = req.params;

        if (!['pet', 'product'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid favorite type. Must be "pet" or "product"'
            });
        }

        const isFavorited = await FavoriteModel.isFavorited(userId, type, id);

        res.json({
            success: true,
            is_favorited: isFavorited
        });
    } catch (error) {
        console.error('Check favorite error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check favorite status'
        });
    }
};

// Get favorite counts
const getFavoriteCounts = async (req, res) => {
    try {
        const userId = req.user.id;

        const counts = await FavoriteModel.getCounts(userId);

        res.json({
            success: true,
            counts
        });
    } catch (error) {
        console.error('Get favorite counts error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get favorite counts'
        });
    }
};

// Clear all favorites
const clearFavorites = async (req, res) => {
    try {
        const userId = req.user.id;

        const count = await FavoriteModel.clearAll(userId);

        res.json({
            success: true,
            message: `All favorites cleared (${count} items removed)`
        });
    } catch (error) {
        console.error('Clear favorites error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear favorites'
        });
    }
};

// Get favorite suggestions
const getFavoriteSuggestions = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 10 } = req.query;

        const suggestions = await FavoriteModel.getSuggestions(userId, limit);

        res.json({
            success: true,
            data: suggestions
        });
    } catch (error) {
        console.error('Get favorite suggestions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get suggestions'
        });
    }
};

// Get most favorited items (public)
const getMostFavorited = async (req, res) => {
    try {
        const { type = 'pets', limit = 10 } = req.query;

        let items;
        if (type === 'pets') {
            items = await FavoriteModel.getMostFavoritedPets(limit);
        } else {
            // You could add most favorited products here
            items = [];
        }

        res.json({
            success: true,
            type,
            data: items
        });
    } catch (error) {
        console.error('Get most favorited error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get most favorited items'
        });
    }
};

// Bulk add favorites
const bulkAddFavorites = async (req, res) => {
    try {
        const userId = req.user.id;
        const { items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Items array required'
            });
        }

        const results = await FavoriteModel.bulkAdd(userId, items);

        // Get updated counts
        const counts = await FavoriteModel.getCounts(userId);

        res.json({
            success: true,
            message: `Added ${results.added} items, ${results.skipped} already existed`,
            results,
            counts
        });
    } catch (error) {
        console.error('Bulk add favorites error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to bulk add favorites'
        });
    }
};

// Export favorites (for GDPR)
const exportFavorites = async (req, res) => {
    try {
        const userId = req.user.id;

        const data = await FavoriteModel.exportUserData(userId);

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Export favorites error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export favorites'
        });
    }
};

module.exports = {
    getFavorites,
    addFavorite,
    removeFavorite,
    checkFavorite,
    getFavoriteCounts,
    clearFavorites,
    getFavoriteSuggestions,
    getMostFavorited,
    bulkAddFavorites,
    exportFavorites
};