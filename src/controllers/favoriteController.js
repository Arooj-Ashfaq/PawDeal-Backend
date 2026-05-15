// src/controllers/favoriteController.js
const FavoriteModel = require('../models/favoriteModel');
const PetModel = require('../models/petModel');
const ProductModel = require('../models/productModel');
const DB = require('../models/db');
const { v4: uuidv4 } = require('uuid');

// Get user's favorites - SIMPLIFIED VERSION
const getFavorites = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type = 'all' } = req.query;

        let favorites = [];

        if (type === 'pets' || type === 'all') {
            const petFavorites = await DB.query(
                `SELECT 
                    p.*,
                    'pet' as item_type,
                    f.created_at as favorited_at
                FROM favorites f
                JOIN pets p ON f.item_id = p.id
                WHERE f.user_id = ? AND f.item_type = 'pet'`,
                [userId]
            );
            favorites = [...favorites, ...petFavorites];
        }

        if (type === 'products' || type === 'all') {
            const productFavorites = await DB.query(
                `SELECT 
                    pr.*,
                    'product' as item_type,
                    f.created_at as favorited_at
                FROM favorites f
                JOIN products pr ON f.item_id = pr.id
                WHERE f.user_id = ? AND f.item_type = 'product'`,
                [userId]
            );
            favorites = [...favorites, ...productFavorites];
        }

        // Sort by favorited date
        favorites.sort((a, b) => new Date(b.favorited_at) - new Date(a.favorited_at));

        const counts = {
            pets: favorites.filter(f => f.item_type === 'pet').length,
            products: favorites.filter(f => f.item_type === 'product').length,
            total: favorites.length
        };

        res.json({
            success: true,
            data: favorites,
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

        console.log('Add favorite - User:', userId, 'Type:', type, 'ID:', id);

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

        // Check if already favorited
        const existing = await DB.query(
            'SELECT id FROM favorites WHERE user_id = ? AND item_id = ? AND item_type = ?',
            [userId, id, type]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Item already in favorites'
            });
        }

        // Add to favorites
        const favoriteId = uuidv4();
        await DB.query(
            'INSERT INTO favorites (id, user_id, item_id, item_type, created_at) VALUES (?, ?, ?, ?, NOW())',
            [favoriteId, userId, id, type]
        );

        res.json({
            success: true,
            message: 'Added to favorites'
        });
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

        await DB.query(
            'DELETE FROM favorites WHERE user_id = ? AND item_id = ? AND item_type = ?',
            [userId, id, type]
        );

        res.json({
            success: true,
            message: 'Removed from favorites'
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

        const result = await DB.query(
            'SELECT id FROM favorites WHERE user_id = ? AND item_id = ? AND item_type = ?',
            [userId, id, type]
        );

        res.json({
            success: true,
            is_favorited: result.length > 0
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
        
        const petCount = await DB.query(
            'SELECT COUNT(*) as count FROM favorites WHERE user_id = ? AND item_type = "pet"',
            [userId]
        );
        
        const productCount = await DB.query(
            'SELECT COUNT(*) as count FROM favorites WHERE user_id = ? AND item_type = "product"',
            [userId]
        );

        res.json({
            success: true,
            counts: {
                pets: petCount[0]?.count || 0,
                products: productCount[0]?.count || 0,
                total: (petCount[0]?.count || 0) + (productCount[0]?.count || 0)
            }
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
        await DB.query('DELETE FROM favorites WHERE user_id = ?', [userId]);
        res.json({
            success: true,
            message: 'All favorites cleared'
        });
    } catch (error) {
        console.error('Clear favorites error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear favorites'
        });
    }
};

module.exports = {
    getFavorites,
    addFavorite,
    removeFavorite,
    checkFavorite,
    getFavoriteCounts,
    clearFavorites
};