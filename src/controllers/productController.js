// src/controllers/productController.js
const ProductModel = require('../models/productModel');
const { uploadMultiple, deleteFile } = require('../middleware/upload');

// Create new product
const createProduct = async (req, res) => {
    try {
        const userId = req.user.id;

        const {
            name, category, subcategory, pet_type,
            description, price, sale_price, currency,
            stock_quantity, sku, brand, weight_kg, dimensions,
            materials, care_instructions, status = 'active'
        } = req.body;

        // Handle pet_type - if it's an array, stringify it; if already string, use as is
        let petTypeValue = pet_type;
        if (Array.isArray(pet_type)) {
            petTypeValue = JSON.stringify(pet_type);
        }
        if (typeof pet_type === 'string' && pet_type.startsWith('[')) {
            petTypeValue = pet_type; // Already a JSON string
        }
        if (!petTypeValue) {
            petTypeValue = '[]'; // Empty array as default
        }

        const productData = {
            seller_id: userId,
            name,
            category,
            subcategory: subcategory || null,
            pet_type: petTypeValue,
            description: description || null,
            price: parseFloat(price),
            sale_price: sale_price ? parseFloat(sale_price) : null,
            currency: currency || 'USD',
            stock_quantity: parseInt(stock_quantity) || 0,
            sku: sku,
            brand: brand || null,
            weight_kg: weight_kg ? parseFloat(weight_kg) : null,
            dimensions: dimensions || null,
            materials: materials || null,
            care_instructions: care_instructions || null,
            status: status
        };

        const productId = await ProductModel.create(productData);

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            id: productId
        });
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create product',
            details: error.message
        });
    }
};

// Get all products
const getProducts = async (req, res) => {
    try {
        const { page = 1, limit = 20, category, subcategory, brand, min_price, max_price, search, sort_by, in_stock, on_sale } = req.query;
        
        const filters = {
            category,
            subcategory,
            brand,
            min_price,
            max_price,
            search,
            sort_by,
            in_stock: in_stock === 'true',
            on_sale: on_sale === 'true'
        };
        
        const result = await ProductModel.findAll(filters, page, limit);
        
        res.json({
            success: true,
            data: result.data,
            pagination: result.pagination
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products'
        });
    }
};

// Get single product
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const product = await ProductModel.findById(id);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        // Increment view count
        await ProductModel.incrementViews(id);
        
        res.json({
            success: true,
            product
        });
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch product'
        });
    }
};

// Update product
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const product = await ProductModel.findById(id);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        if (product.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to update this product'
            });
        }
        
        await ProductModel.update(id, req.body);
        
        res.json({
            success: true,
            message: 'Product updated successfully'
        });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update product'
        });
    }
};

// Delete product
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const product = await ProductModel.findById(id);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        if (product.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to delete this product'
            });
        }
        
        await ProductModel.delete(id);
        
        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete product'
        });
    }
};

// Upload product images
const uploadProductImages = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const product = await ProductModel.findById(id);
        if (!product || product.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to add images to this product'
            });
        }
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No image files provided'
            });
        }
        
        const uploadedImages = [];
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const imageUrl = `/uploads/products/${file.filename}`;
            const isPrimary = i === 0;
            
            await ProductModel.addImage(id, imageUrl, isPrimary);
            uploadedImages.push({ url: imageUrl, is_primary: isPrimary });
        }
        
        res.json({
            success: true,
            message: `${uploadedImages.length} image(s) uploaded successfully`,
            images: uploadedImages
        });
    } catch (error) {
        console.error('Upload product images error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload images'
        });
    }
};

// Get product images
const getProductImages = async (req, res) => {
    try {
        const { id } = req.params;
        
        const images = await ProductModel.query(
            'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order',
            [id]
        );
        
        res.json({
            success: true,
            images
        });
    } catch (error) {
        console.error('Get product images error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch images'
        });
    }
};

// Delete product image
const deleteProductImage = async (req, res) => {
    try {
        const { productId, imageId } = req.params;
        const userId = req.user.id;
        
        const product = await ProductModel.findById(productId);
        if (!product || product.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to delete images from this product'
            });
        }
        
        await ProductModel.removeImage(imageId);
        
        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Delete product image error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete image'
        });
    }
};

// Set primary image
const setPrimaryImage = async (req, res) => {
    try {
        const { productId, imageId } = req.params;
        const userId = req.user.id;
        
        const product = await ProductModel.findById(productId);
        if (!product || product.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to modify this product'
            });
        }
        
        await ProductModel.setPrimaryImage(productId, imageId);
        
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

// Get products by seller
const getProductsBySeller = async (req, res) => {
    try {
        const { sellerId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        
        const result = await ProductModel.findBySeller(sellerId, page, limit);
        
        res.json({
            success: true,
            data: result.data,
            pagination: result.pagination
        });
    } catch (error) {
        console.error('Get products by seller error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch seller products'
        });
    }
};

module.exports = {
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
};