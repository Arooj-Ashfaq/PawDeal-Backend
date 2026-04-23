// src/controllers/petController.js
const PetModel = require('../models/petModel');
const UserModel = require('../models/userModel');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/pets');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, JPG, WEBP are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

// Create new pet listing
const createPet = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const petData = {
            ...req.body,
            seller_id: userId
        };
        
        const petId = await PetModel.create(petData);
        
        res.status(201).json({
            success: true,
            message: 'Pet listed successfully',
            id: petId
        });
    } catch (error) {
        console.error('Create pet error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create pet listing'
        });
    }
};

// Get all pets
const getPets = async (req, res) => {
    try {
        const { page = 1, limit = 20, category, gender, min_price, max_price, search, sort_by } = req.query;
        
        const filters = {
            category,
            gender,
            min_price,
            max_price,
            search,
            sort_by
        };
        
        const pets = await PetModel.findAll(filters, page, limit);
        
        res.json({
            success: true,
            ...pets
        });
    } catch (error) {
        console.error('Get pets error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch pets'
        });
    }
};

// Get single pet
const getPetById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const pet = await PetModel.findById(id);
        
        if (!pet) {
            return res.status(404).json({
                success: false,
                error: 'Pet not found'
            });
        }
        
        // Increment view count
        await PetModel.incrementViews(id);
        
        res.json({
            success: true,
            pet
        });
    } catch (error) {
        console.error('Get pet error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch pet'
        });
    }
};

// Update pet
const updatePet = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const pet = await PetModel.findById(id);
        
        if (!pet) {
            return res.status(404).json({
                success: false,
                error: 'Pet not found'
            });
        }
        
        if (pet.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to update this pet'
            });
        }
        
        await PetModel.update(id, req.body);
        
        res.json({
            success: true,
            message: 'Pet updated successfully'
        });
    } catch (error) {
        console.error('Update pet error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update pet'
        });
    }
};

// Delete pet
const deletePet = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const pet = await PetModel.findById(id);
        
        if (!pet) {
            return res.status(404).json({
                success: false,
                error: 'Pet not found'
            });
        }
        
        if (pet.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to delete this pet'
            });
        }
        
        await PetModel.delete(id);
        
        res.json({
            success: true,
            message: 'Pet deleted successfully'
        });
    } catch (error) {
        console.error('Delete pet error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete pet'
        });
    }
};

// Upload pet image
const uploadPetImage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        // Check if user owns the pet
        const pet = await PetModel.findById(id);
        if (!pet || pet.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to add images to this pet'
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }
        
        // Save image path
        const imageUrl = `/uploads/pets/${req.file.filename}`;
        
        // Check if this is the first image (make it primary)
        const existingImages = await PetModel.query(
            'SELECT COUNT(*) as count FROM pet_images WHERE pet_id = ?',
            [id]
        );
        const isPrimary = existingImages[0].count === 0;
        
        await PetModel.addImage(id, imageUrl, isPrimary);
        
        res.json({
            success: true,
            message: 'Image uploaded successfully',
            imageUrl,
            isPrimary
        });
    } catch (error) {
        console.error('Upload pet image error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload image'
        });
    }
};

// Get pet images
const getPetImages = async (req, res) => {
    try {
        const { id } = req.params;
        
        const images = await PetModel.query(
            'SELECT * FROM pet_images WHERE pet_id = ? ORDER BY sort_order',
            [id]
        );
        
        res.json({
            success: true,
            images
        });
    } catch (error) {
        console.error('Get pet images error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch images'
        });
    }
};

// Delete pet image
const deletePetImage = async (req, res) => {
    try {
        const { id, imageId } = req.params;
        const userId = req.user.id;
        
        // Check if user owns the pet
        const pet = await PetModel.findById(id);
        if (!pet || pet.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to delete images from this pet'
            });
        }
        
        await PetModel.removeImage(imageId);
        
        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Delete pet image error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete image'
        });
    }
};

// Set primary image
const setPrimaryImage = async (req, res) => {
    try {
        const { id, imageId } = req.params;
        const userId = req.user.id;
        
        // Check if user owns the pet
        const pet = await PetModel.findById(id);
        if (!pet || pet.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to modify this pet'
            });
        }
        
        await PetModel.setPrimaryImage(id, imageId);
        
        res.json({
            success: true,
            message: 'Primary image updated'
        });
    } catch (error) {
        console.error('Set primary image error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to set primary image'
        });
    }
};

module.exports = {
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
};