// src/routes/favoriteRoutes.js
const express = require('express');
const router = express.Router();
const {
    getFavorites,
    addFavorite,
    removeFavorite,
    checkFavorite,
    getFavoriteCounts,
    clearFavorites
} = require('../controllers/favoriteController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Favorites management
router.get('/', getFavorites);
router.get('/counts', getFavoriteCounts);
router.get('/check/:type/:id', checkFavorite);
router.post('/:type/:id', addFavorite);
router.delete('/:type/:id', removeFavorite);
router.delete('/', clearFavorites);

module.exports = router;