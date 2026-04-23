// src/routes/searchRoutes.js
const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/searchController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

// Public search routes
router.get('/', optionalAuth, globalSearch);
router.get('/suggestions', getSuggestions);
router.get('/popular', getPopularSearches);
router.get('/location', searchByLocation);

// Protected search routes
router.get('/recent', authenticate, getRecentSearches);
router.post('/save', authenticate, saveSearch);
router.get('/saved', authenticate, getSavedSearches);
router.delete('/saved/:id', authenticate, deleteSavedSearch);
router.delete('/history', authenticate, clearSearchHistory);

// Advanced search (POST for complex queries)
router.post('/advanced', optionalAuth, advancedSearch);

// Special search types
router.post('/voice', voiceSearch);
router.post('/image', uploadSingle('image'), imageSearch);

module.exports = router;