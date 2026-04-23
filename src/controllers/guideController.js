// src/controllers/guideController.js
const GuideModel = require('../models/guideModel');
const UserModel = require('../models/userModel');
const BreedModel = require('../models/breedModel');
const CommentModel = require('../models/commentModel');
const { uploadSingle, deleteFile } = require('../middleware/upload');
const path = require('path');

// Create guide
const createGuide = async (req, res) => {
    try {
        const userId = req.user.id;

        // Check if user is admin, author, or verified seller
        if (req.user.role !== 'admin' && req.user.role !== 'author') {
            const isSeller = await UserModel.isSeller(userId);
            if (!isSeller) {
                return res.status(403).json({
                    success: false,
                    error: 'You are not authorized to create guides'
                });
            }
        }

        const {
            title, guide_type, breed_id, content,
            difficulty, estimated_read_time, status = 'draft'
        } = req.body;

        // Validate breed if guide_type is 'breed'
        if (guide_type === 'breed' && breed_id) {
            const breed = await BreedModel.findById(breed_id);
            if (!breed) {
                return res.status(404).json({
                    success: false,
                    error: 'Breed not found'
                });
            }
        }

        // Generate slug from title
        const slug = await GuideModel.generateSlug(title);

        const guideId = await GuideModel.create({
            author_id: userId,
            title,
            slug,
            guide_type,
            breed_id: guide_type === 'breed' ? breed_id : null,
            content,
            difficulty: difficulty || 'beginner',
            estimated_read_time: estimated_read_time || GuideModel.getReadingTime(content).split(' ')[0],
            status
        });

        res.status(201).json({
            success: true,
            message: 'Guide created successfully',
            guideId,
            slug
        });
    } catch (error) {
        console.error('Create guide error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create guide'
        });
    }
};

// Get all guides
const getGuides = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            guide_type,
            breed_id,
            difficulty,
            author_id,
            search,
            status = 'published',
            sort_by = 'published_at',
            sort_order = 'DESC'
        } = req.query;

        // Only admins and authors can see drafts
        let effectiveStatus = status;
        if (status === 'draft' && req.user?.role !== 'admin' && req.user?.role !== 'author') {
            effectiveStatus = 'published';
        }

        const filters = {
            guide_type,
            breed_id,
            difficulty,
            author_id,
            search,
            status: effectiveStatus,
            sort_by,
            sort_order
        };

        const result = await GuideModel.findAll(filters, page, limit);

        // Add reading time to each guide
        for (const guide of result.data) {
            guide.reading_time = GuideModel.getReadingTime(guide.content);
        }

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Get guides error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch guides'
        });
    }
};

// Get single guide by slug
const getGuideBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        const guide = await GuideModel.findBySlug(slug);

        if (!guide) {
            return res.status(404).json({
                success: false,
                error: 'Guide not found'
            });
        }

        // Add reading time
        guide.reading_time = GuideModel.getReadingTime(guide.content);

        // Get comments
        const comments = await CommentModel.getComments('guide', guide.id, 1, 20);

        // Get related guides
        const related = await GuideModel.getRelated(guide.id);

        // Get next and previous guides
        const { next, previous } = await GuideModel.getAdjacentGuides(guide.id);

        res.json({
            success: true,
            guide,
            comments: comments.data,
            comment_count: comments.pagination.total,
            related_guides: related,
            next_guide: next,
            previous_guide: previous
        });
    } catch (error) {
        console.error('Get guide error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch guide'
        });
    }
};

// Get single guide by ID (admin/author)
const getGuideById = async (req, res) => {
    try {
        const { id } = req.params;

        const guide = await GuideModel.findById(id);

        if (!guide) {
            return res.status(404).json({
                success: false,
                error: 'Guide not found'
            });
        }

        // Check if user can view draft
        if (guide.status === 'draft' && req.user?.role !== 'admin' && req.user?.id !== guide.author_id) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to view this guide'
            });
        }

        guide.reading_time = GuideModel.getReadingTime(guide.content);

        res.json({
            success: true,
            guide
        });
    } catch (error) {
        console.error('Get guide by ID error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch guide'
        });
    }
};

// Update guide
const updateGuide = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const guide = await GuideModel.findById(id);

        if (!guide) {
            return res.status(404).json({
                success: false,
                error: 'Guide not found'
            });
        }

        // Check authorization
        if (guide.author_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to update this guide'
            });
        }

        const {
            title, guide_type, breed_id, content,
            difficulty, estimated_read_time, status
        } = req.body;

        const updateData = {};

        if (title) {
            updateData.title = title;
            updateData.slug = await GuideModel.generateSlug(title);
        }
        if (guide_type) updateData.guide_type = guide_type;
        if (breed_id !== undefined) updateData.breed_id = breed_id || null;
        if (content) updateData.content = content;
        if (difficulty) updateData.difficulty = difficulty;
        if (estimated_read_time) updateData.estimated_read_time = estimated_read_time;
        if (status) updateData.status = status;

        const updated = await GuideModel.update(id, updateData);

        if (updated) {
            const updatedGuide = await GuideModel.findById(id);
            res.json({
                success: true,
                message: 'Guide updated successfully',
                guide: updatedGuide
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'No changes made'
            });
        }
    } catch (error) {
        console.error('Update guide error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update guide'
        });
    }
};

// Delete guide
const deleteGuide = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const guide = await GuideModel.findById(id);

        if (!guide) {
            return res.status(404).json({
                success: false,
                error: 'Guide not found'
            });
        }

        // Check authorization
        if (guide.author_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to delete this guide'
            });
        }

        // Delete featured image if exists
        if (guide.featured_image_url) {
            const imagePath = path.join(__dirname, '../../', guide.featured_image_url);
            deleteFile(imagePath);
        }

        await GuideModel.delete(id);

        res.json({
            success: true,
            message: 'Guide deleted successfully'
        });
    } catch (error) {
        console.error('Delete guide error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete guide'
        });
    }
};

// Upload featured image
const uploadFeaturedImage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const guide = await GuideModel.findById(id);

        if (!guide) {
            return res.status(404).json({
                success: false,
                error: 'Guide not found'
            });
        }

        // Check authorization
        if (guide.author_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to update this guide'
            });
        }

        uploadSingle('image')(req, res, async (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No image provided'
                });
            }

            // Delete old image if exists
            if (guide.featured_image_url) {
                const oldPath = path.join(__dirname, '../../', guide.featured_image_url);
                deleteFile(oldPath);
            }

            const imageUrl = `/uploads/guides/${req.file.filename}`;

            await GuideModel.update(id, { featured_image_url: imageUrl });

            res.json({
                success: true,
                message: 'Featured image uploaded successfully',
                image_url: imageUrl
            });
        });
    } catch (error) {
        console.error('Upload featured image error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload image'
        });
    }
};

// Mark guide as helpful
const markHelpful = async (req, res) => {
    try {
        const { id } = req.params;

        const guide = await GuideModel.findById(id);

        if (!guide) {
            return res.status(404).json({
                success: false,
                error: 'Guide not found'
            });
        }

        await GuideModel.markHelpful(id);

        res.json({
            success: true,
            message: 'Thank you for your feedback!'
        });
    } catch (error) {
        console.error('Mark helpful error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark guide as helpful'
        });
    }
};

// Get guides by type
const getGuidesByType = async (req, res) => {
    try {
        const { type } = req.params;
        const { page = 1, limit = 12 } = req.query;

        const validTypes = ['breed', 'care', 'training', 'health', 'buying'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid guide type'
            });
        }

        const result = await GuideModel.getByType(type, page, limit);

        res.json({
            success: true,
            guide_type: type,
            ...result
        });
    } catch (error) {
        console.error('Get guides by type error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch guides by type'
        });
    }
};

// Get guides by breed
const getGuidesByBreed = async (req, res) => {
    try {
        const { breedId } = req.params;
        const { page = 1, limit = 12 } = req.query;

        const breed = await BreedModel.findById(breedId);
        if (!breed) {
            return res.status(404).json({
                success: false,
                error: 'Breed not found'
            });
        }

        const result = await GuideModel.getByBreed(breedId, page, limit);

        res.json({
            success: true,
            breed: breed.name,
            ...result
        });
    } catch (error) {
        console.error('Get guides by breed error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch guides by breed'
        });
    }
};

// Get guides by author
const getGuidesByAuthor = async (req, res) => {
    try {
        const { authorId } = req.params;
        const { page = 1, limit = 12 } = req.query;

        const author = await UserModel.findById(authorId);
        if (!author) {
            return res.status(404).json({
                success: false,
                error: 'Author not found'
            });
        }

        const result = await GuideModel.getByAuthor(authorId, page, limit);

        res.json({
            success: true,
            author: {
                id: author.id,
                name: `${author.first_name} ${author.last_name}`,
                avatar: author.profile_image_url
            },
            ...result
        });
    } catch (error) {
        console.error('Get guides by author error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch guides by author'
        });
    }
};

// Get popular guides
const getPopularGuides = async (req, res) => {
    try {
        const { limit = 6 } = req.query;

        const guides = await GuideModel.getPopular(limit);

        res.json({
            success: true,
            data: guides
        });
    } catch (error) {
        console.error('Get popular guides error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch popular guides'
        });
    }
};

// Get featured guides
const getFeaturedGuides = async (req, res) => {
    try {
        const { limit = 3 } = req.query;

        const guides = await GuideModel.getFeatured(limit);

        res.json({
            success: true,
            data: guides
        });
    } catch (error) {
        console.error('Get featured guides error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch featured guides'
        });
    }
};

// Get beginner guides
const getBeginnerGuides = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const guides = await GuideModel.getBeginnerGuides(limit);

        res.json({
            success: true,
            data: guides
        });
    } catch (error) {
        console.error('Get beginner guides error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch beginner guides'
        });
    }
};

// Get breed care guides
const getBreedCareGuides = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const guides = await GuideModel.getBreedCareGuides(limit);

        res.json({
            success: true,
            data: guides
        });
    } catch (error) {
        console.error('Get breed care guides error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch breed care guides'
        });
    }
};

// Get training guides
const getTrainingGuides = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const guides = await GuideModel.getTrainingGuides(limit);

        res.json({
            success: true,
            data: guides
        });
    } catch (error) {
        console.error('Get training guides error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch training guides'
        });
    }
};

// Get health guides
const getHealthGuides = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const guides = await GuideModel.getHealthGuides(limit);

        res.json({
            success: true,
            data: guides
        });
    } catch (error) {
        console.error('Get health guides error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch health guides'
        });
    }
};

// Get buying guides
const getBuyingGuides = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const guides = await GuideModel.getBuyingGuides(limit);

        res.json({
            success: true,
            data: guides
        });
    } catch (error) {
        console.error('Get buying guides error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch buying guides'
        });
    }
};

// Search guides
const searchGuides = async (req, res) => {
    try {
        const { q, page = 1, limit = 12 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query required'
            });
        }

        const result = await GuideModel.search(q, page, limit);

        res.json({
            success: true,
            query: q,
            ...result
        });
    } catch (error) {
        console.error('Search guides error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search guides'
        });
    }
};

// Get author stats
const getAuthorStats = async (req, res) => {
    try {
        const { authorId } = req.params;

        const author = await UserModel.findById(authorId);
        if (!author) {
            return res.status(404).json({
                success: false,
                error: 'Author not found'
            });
        }

        const stats = await GuideModel.getAuthorStats(authorId);

        res.json({
            success: true,
            author: {
                id: author.id,
                name: `${author.first_name} ${author.last_name}`
            },
            stats
        });
    } catch (error) {
        console.error('Get author stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch author stats'
        });
    }
};

// Get guide statistics (admin)
const getGuideStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const stats = await GuideModel.getStats();

        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        console.error('Get guide stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get guide statistics'
        });
    }
};

// Bulk update status (admin)
const bulkUpdateStatus = async (req, res) => {
    try {
        const { guide_ids, status } = req.body;

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        if (!Array.isArray(guide_ids) || guide_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Guide IDs array required'
            });
        }

        await GuideModel.bulkUpdateStatus(guide_ids, status);

        res.json({
            success: true,
            message: `${guide_ids.length} guides updated successfully`
        });
    } catch (error) {
        console.error('Bulk update status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to bulk update guides'
        });
    }
};

module.exports = {
    createGuide,
    getGuides,
    getGuideBySlug,
    getGuideById,
    updateGuide,
    deleteGuide,
    uploadFeaturedImage,
    markHelpful,
    getGuidesByType,
    getGuidesByBreed,
    getGuidesByAuthor,
    getPopularGuides,
    getFeaturedGuides,
    getBeginnerGuides,
    getBreedCareGuides,
    getTrainingGuides,
    getHealthGuides,
    getBuyingGuides,
    searchGuides,
    getAuthorStats,
    getGuideStats,
    bulkUpdateStatus
};