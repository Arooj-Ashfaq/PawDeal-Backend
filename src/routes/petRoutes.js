// src/routes/petRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
    createPet,
    getPets,
    getPetById,
    updatePet,
    deletePet,
    uploadPetImage,
    getPetImages,
    deletePetImage,
    setPrimaryImage,
    upload
} = require('../controllers/petController');

// Public routes
router.get('/', getPets);
router.get('/:id', getPetById);
router.get('/:id/images', getPetImages);

// Protected routes (require login)
router.post('/', authenticate, createPet);
router.put('/:id', authenticate, updatePet);
router.delete('/:id', authenticate, deletePet);
router.post('/:id/images', authenticate, upload.single('image'), uploadPetImage);
router.delete('/:id/images/:imageId', authenticate, deletePetImage);
router.put('/:id/images/:imageId/primary', authenticate, setPrimaryImage);

module.exports = router;