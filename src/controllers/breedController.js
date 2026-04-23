// src/controllers/breedController.js
const BreedModel = require('../models/breedModel');
const PetModel = require('../models/petModel');
const AnalyticsModel = require('../models/analyticsModel');

// Create new breed
const createBreed = async (req, res) => {
    try {
        const {
            name, category, description, temperament,
            care_requirements, health_considerations,
            average_size, average_weight, life_expectancy,
            image_url, popular
        } = req.body;

        // Check if breed already exists
        const existing = await BreedModel.findByName(name);
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Breed already exists'
            });
        }

        const breedId = await BreedModel.create({
            name,
            category,
            description,
            temperament,
            care_requirements,
            health_considerations,
            average_size,
            average_weight,
            life_expectancy,
            image_url,
            popular: popular || false
        });

        res.status(201).json({
            success: true,
            message: 'Breed created successfully',
            breedId
        });
    } catch (error) {
        console.error('Create breed error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create breed'
        });
    }
};

// Get all breeds
const getBreeds = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            category,
            popular,
            search
        } = req.query;

        const filters = {
            category,
            popular: popular === 'true',
            search
        };

        const result = await BreedModel.findAll(filters, page, limit);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Get breeds error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch breeds'
        });
    }
};

// Get breed by ID
const getBreedById = async (req, res) => {
    try {
        const { id } = req.params;

        const breed = await BreedModel.findById(id);

        if (!breed) {
            return res.status(404).json({
                success: false,
                error: 'Breed not found'
            });
        }

        res.json({
            success: true,
            breed
        });
    } catch (error) {
        console.error('Get breed error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch breed'
        });
    }
};

// Update breed
const updateBreed = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const breed = await BreedModel.findById(id);
        if (!breed) {
            return res.status(404).json({
                success: false,
                error: 'Breed not found'
            });
        }

        const updated = await BreedModel.update(id, updateData);

        if (updated) {
            const updatedBreed = await BreedModel.findById(id);
            res.json({
                success: true,
                message: 'Breed updated successfully',
                breed: updatedBreed
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'No changes made'
            });
        }
    } catch (error) {
        console.error('Update breed error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update breed'
        });
    }
};

// Delete breed
const deleteBreed = async (req, res) => {
    try {
        const { id } = req.params;

        const breed = await BreedModel.findById(id);
        if (!breed) {
            return res.status(404).json({
                success: false,
                error: 'Breed not found'
            });
        }

        await BreedModel.delete(id);

        res.json({
            success: true,
            message: 'Breed deleted successfully'
        });
    } catch (error) {
        console.error('Delete breed error:', error);
        if (error.message === 'Cannot delete breed that is used by pets') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        res.status(500).json({
            success: false,
            error: 'Failed to delete breed'
        });
    }
};

// Get breeds by category
const getBreedsByCategory = async (req, res) => {
    try {
        const { category } = req.params;

        const breeds = await BreedModel.getByCategory(category);

        res.json({
            success: true,
            category,
            count: breeds.length,
            data: breeds
        });
    } catch (error) {
        console.error('Get breeds by category error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch breeds by category'
        });
    }
};

// Get popular breeds
const getPopularBreeds = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const breeds = await BreedModel.getPopular(limit);

        res.json({
            success: true,
            data: breeds
        });
    } catch (error) {
        console.error('Get popular breeds error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch popular breeds'
        });
    }
};

// Get breed guide
const getBreedGuide = async (req, res) => {
    try {
        const { id } = req.params;

        const guide = await BreedModel.getGuide(id);

        if (!guide) {
            return res.status(404).json({
                success: false,
                error: 'Breed guide not found'
            });
        }

        res.json({
            success: true,
            guide
        });
    } catch (error) {
        console.error('Get breed guide error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch breed guide'
        });
    }
};

// Get pets by breed
const getBreedPets = async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 20 } = req.query;

        const breed = await BreedModel.findById(id);
        if (!breed) {
            return res.status(404).json({
                success: false,
                error: 'Breed not found'
            });
        }

        const pets = await BreedModel.getPets(id, limit);

        res.json({
            success: true,
            breed: breed.name,
            count: pets.length,
            data: pets
        });
    } catch (error) {
        console.error('Get breed pets error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch breed pets'
        });
    }
};

// Search breeds
const searchBreeds = async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query must be at least 2 characters'
            });
        }

        const breeds = await BreedModel.search(q, limit);

        // Track search
        await AnalyticsModel.trackSearch(
            req.user?.id,
            req.session?.id,
            q,
            { type: 'breeds' },
            breeds.length
        );

        res.json({
            success: true,
            query: q,
            count: breeds.length,
            data: breeds
        });
    } catch (error) {
        console.error('Search breeds error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search breeds'
        });
    }
};

// Get breed statistics (admin)
const getBreedStats = async (req, res) => {
    try {
        const stats = await BreedModel.getStats();

        // Get counts by category
        const byCategory = await BreedModel.getCountByCategory();

        res.json({
            success: true,
            stats: stats[0],
            by_category: byCategory
        });
    } catch (error) {
        console.error('Get breed stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get breed statistics'
        });
    }
};

// Bulk import breeds (admin)
const bulkImportBreeds = async (req, res) => {
    try {
        const { breeds } = req.body;

        if (!Array.isArray(breeds) || breeds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Breeds array required'
            });
        }

        const results = await BreedModel.bulkImport(breeds);

        res.json({
            success: true,
            message: `Imported ${results.success} breeds successfully, ${results.failed} failed`,
            results
        });
    } catch (error) {
        console.error('Bulk import breeds error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to bulk import breeds'
        });
    }
};

// Get breed suggestions based on user preferences
const getBreedSuggestions = async (req, res) => {
    try {
        const {
            category,
            size,
            good_with_children,
            good_with_pets,
            shedding,
            grooming,
            trainability
        } = req.query;

        const preferences = {
            category,
            size,
            good_with_children: good_with_children === 'true',
            good_with_pets: good_with_pets === 'true',
            shedding,
            grooming,
            trainability
        };

        const suggestions = await BreedModel.getSuggestions(preferences);

        res.json({
            success: true,
            data: suggestions
        });
    } catch (error) {
        console.error('Get breed suggestions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get breed suggestions'
        });
    }
};

// Get breed of the month
const getBreedOfMonth = async (req, res) => {
    try {
        const breed = await BreedModel.getBreedOfMonth();

        res.json({
            success: true,
            data: breed
        });
    } catch (error) {
        console.error('Get breed of month error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get breed of the month'
        });
    }
};

// Get similar breeds
const getSimilarBreeds = async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 5 } = req.query;

        const breed = await BreedModel.findById(id);
        if (!breed) {
            return res.status(404).json({
                success: false,
                error: 'Breed not found'
            });
        }

        const similar = await BreedModel.getSimilar(id, limit);

        res.json({
            success: true,
            data: similar
        });
    } catch (error) {
        console.error('Get similar breeds error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get similar breeds'
        });
    }
};

module.exports = {
    createBreed,
    getBreeds,
    getBreedById,
    updateBreed,
    deleteBreed,
    getBreedsByCategory,
    getPopularBreeds,
    getBreedGuide,
    getBreedPets,
    searchBreeds,
    getBreedStats,
    bulkImportBreeds,
    getBreedSuggestions,
    getBreedOfMonth,
    getSimilarBreeds
};