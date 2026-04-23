// src/routes/breedRoutes.js
const express = require('express');
const router = express.Router();
const {
    createBreed,
    getBreeds,
    getBreedById,
    updateBreed,
    deleteBreed,
    getBreedsByCategory,
    getPopularBreeds,
    getBreedGuide,
    getBreedPets,
    getBreedStats,
    searchBreeds,
    bulkImportBreeds
} = require('../controllers/breedController');
const { authenticate, authorize } = require('../middleware/auth');

// Public routes
router.get('/', getBreeds);
router.get('/popular', getPopularBreeds);
router.get('/category/:category', getBreedsByCategory);
router.get('/search', searchBreeds);
router.get('/:id', getBreedById);
router.get('/:id/guide', getBreedGuide);
router.get('/:id/pets', getBreedPets);

// Admin only routes
router.use(authenticate);
router.use(authorize('admin'));

router.post('/', createBreed);
router.put('/:id', updateBreed);
router.delete('/:id', deleteBreed);
router.post('/bulk/import', bulkImportBreeds);
router.get('/admin/stats', getBreedStats);

module.exports = router;