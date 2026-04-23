// src/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    uploadProductImages,
    deleteProductImage,
    setPrimaryImage,
    addReview,
    getReviews,
    updateStock,
    checkStock,
    getProductsBySeller,
    getFeaturedProducts,
    getProductsByCategory,
    searchProducts,
    getBrands,
    getCategories,
    toggleFeatured,
    bulkUpdateStatus,
    getLowStock,
    getProductStats
} = require('../controllers/productController');
const { authenticate, optionalAuth, authorize } = require('../middleware/auth');
const { validate, productValidation } = require('../middleware/validation');

// Public routes
router.get('/', optionalAuth, getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/brands', getBrands);
router.get('/categories', getCategories);
router.get('/search', searchProducts);
router.get('/seller/:sellerId', getProductsBySeller);
router.get('/category/:category', getProductsByCategory);
router.get('/:id', optionalAuth, validate(productValidation.id), getProductById);
router.get('/:id/stock', checkStock);
router.get('/:id/reviews', getReviews);

// Protected routes (require authentication)
router.use(authenticate);

// Product management
router.post('/', validate(productValidation.create), createProduct);
router.put('/:id', validate(productValidation.id), updateProduct);
router.delete('/:id', validate(productValidation.id), deleteProduct);

// Image management
router.post('/:id/images', validate(productValidation.id), uploadProductImages);
router.delete('/:productId/images/:imageId', deleteProductImage);
router.put('/:productId/images/:imageId/primary', setPrimaryImage);

// Reviews
router.post('/:productId/reviews', addReview);

// Stock management
router.patch('/:id/stock', updateStock);

// Seller specific
router.get('/seller/low-stock', getLowStock);

// Admin only routes
router.patch('/:id/featured', authorize('admin'), toggleFeatured);
router.post('/bulk/status', authorize('admin'), bulkUpdateStatus);
router.get('/admin/stats', authorize('admin'), getProductStats);

module.exports = router;