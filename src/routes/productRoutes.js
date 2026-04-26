// src/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate, productValidation } = require('../middleware/validation');
const { uploadMultiple } = require('../middleware/upload');
const {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    uploadProductImages,
    getProductImages,
    deleteProductImage,
    setPrimaryImage,
    getProductsBySeller
} = require('../controllers/productController');

// Public routes
router.get('/', getProducts);
router.get('/seller/:sellerId', getProductsBySeller);
router.get('/:id', getProductById);
router.get('/:id/images', getProductImages);

// Protected routes (require login)
router.post('/', authenticate, validate(productValidation.create), createProduct);
router.put('/:id', authenticate, updateProduct);
router.delete('/:id', authenticate, deleteProduct);
router.post('/:id/images', authenticate, uploadMultiple('image', 5), uploadProductImages);
router.delete('/:productId/images/:imageId', authenticate, deleteProductImage);
router.put('/:productId/images/:imageId/primary', authenticate, setPrimaryImage);

module.exports = router;