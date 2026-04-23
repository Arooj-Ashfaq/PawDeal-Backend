// src/controllers/productController.js
const ProductModel = require('../models/productModel');
const UserModel = require('../models/userModel');
const FavoriteModel = require('../models/favoriteModel');
const { uploadMultiple, deleteFile } = require('../middleware/upload');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create new product
const createProduct = async (req, res) => {
    try {
        const userId = req.user.id;

        const {
            name, category, subcategory, pet_type,
            description, price, sale_price, currency,
            stock_quantity, sku, brand, weight_kg,
            dimensions, materials, care_instructions
        } = req.body;

        // Check if SKU already exists
        const existingProduct = await ProductModel.findBySku(sku);
        if (existingProduct) {
            return res.status(400).json({
                success: false,
                error: 'Product with this SKU already exists'
            });
        }

        const productId = await ProductModel.create({
            seller_id: userId,
            name,
            category,
            subcategory,
            pet_type: Array.isArray(pet_type) ? pet_type : [pet_type],
            description,
            price: parseFloat(price),
            sale_price: sale_price ? parseFloat(sale_price) : null,
            currency: currency || 'USD',
            stock_quantity: parseInt(stock_quantity) || 0,
            sku,
            brand,
            weight_kg: weight_kg ? parseFloat(weight_kg) : null,
            dimensions: dimensions ? JSON.parse(dimensions) : null,
            materials,
            care_instructions,
            status: 'active'
        });

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            productId
        });
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create product'
        });
    }
};

// Get all products with filters
const getProducts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            category,
            subcategory,
            min_price,
            max_price,
            pet_type,
            brand,
            status = 'active',
            seller_id,
            on_sale,
            in_stock,
            min_rating,
            search,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = req.query;

        const filters = {
            category,
            subcategory,
            min_price: min_price ? parseFloat(min_price) : null,
            max_price: max_price ? parseFloat(max_price) : null,
            pet_type,
            brand,
            status,
            seller_id,
            on_sale: on_sale === 'true',
            in_stock: in_stock === 'true',
            min_rating: min_rating ? parseFloat(min_rating) : null,
            search,
            sort_by,
            sort_order
        };

        const result = await ProductModel.findAll(filters, page, limit);

        // Check favorites for authenticated users
        if (req.user) {
            for (const product of result.data) {
                product.is_favorited = await FavoriteModel.isFavorited(req.user.id, 'product', product.id);
            }
        }

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products'
        });
    }
};

// Get single product by ID
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

        // Check if favorited by current user
        if (req.user) {
            product.is_favorited = await FavoriteModel.isFavorited(req.user.id, 'product', id);
        }

        // Get related products
        product.related_products = await ProductModel.getRelated(id);

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

        // Check ownership
        if (product.seller_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to update this product'
            });
        }

        const {
            name, category, subcategory, pet_type,
            description, price, sale_price, currency,
            stock_quantity, sku, brand, weight_kg,
            dimensions, materials, care_instructions, status
        } = req.body;

        // If SKU is changing, check if new SKU exists
        if (sku && sku !== product.sku) {
            const existingProduct = await ProductModel.findBySku(sku);
            if (existingProduct && existingProduct.id !== id) {
                return res.status(400).json({
                    success: false,
                    error: 'Product with this SKU already exists'
                });
            }
        }

        const updated = await ProductModel.update(id, {
            name,
            category,
            subcategory,
            pet_type: pet_type ? (Array.isArray(pet_type) ? pet_type : [pet_type]) : undefined,
            description,
            price: price ? parseFloat(price) : undefined,
            sale_price: sale_price ? parseFloat(sale_price) : undefined,
            currency,
            stock_quantity: stock_quantity ? parseInt(stock_quantity) : undefined,
            sku,
            brand,
            weight_kg: weight_kg ? parseFloat(weight_kg) : undefined,
            dimensions: dimensions ? JSON.parse(dimensions) : undefined,
            materials,
            care_instructions,
            status
        });

        if (updated) {
            res.json({
                success: true,
                message: 'Product updated successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'No changes made'
            });
        }
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

        // Check ownership
        if (product.seller_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to delete this product'
            });
        }

        // Delete images from filesystem
        if (product.images && product.images.length > 0) {
            for (const image of product.images) {
                const imagePath = path.join(__dirname, '../../', image.image_url);
                deleteFile(imagePath);
            }
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

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Check ownership
        if (product.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to upload images for this product'
            });
        }

        // Use multer upload middleware
        uploadMultiple('images', 8)(req, res, async (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No images provided'
                });
            }

            const uploadedImages = [];

            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                const imageUrl = `/uploads/products/${file.filename}`;
                
                // First image is primary if no primary exists
                const isPrimary = i === 0 && product.images.length === 0;
                
                await ProductModel.addImage(id, imageUrl, isPrimary);
                uploadedImages.push({
                    filename: file.filename,
                    url: imageUrl,
                    is_primary: isPrimary
                });
            }

            res.json({
                success: true,
                message: `${uploadedImages.length} image(s) uploaded successfully`,
                images: uploadedImages
            });
        });
    } catch (error) {
        console.error('Upload product images error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload images'
        });
    }
};

// Delete product image
const deleteProductImage = async (req, res) => {
    try {
        const { productId, imageId } = req.params;
        const userId = req.user.id;

        const product = await ProductModel.findById(productId);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Check ownership
        if (product.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to delete this image'
            });
        }

        // Find image to delete
        const image = product.images.find(img => img.id == imageId);
        if (image) {
            const imagePath = path.join(__dirname, '../../', image.image_url);
            deleteFile(imagePath);
        }

        await ProductModel.removeImage(imageId);

        // If deleted image was primary, set another as primary
        if (image && image.is_primary && product.images.length > 1) {
            const nextPrimary = product.images.find(img => img.id != imageId);
            if (nextPrimary) {
                await ProductModel.setPrimaryImage(productId, nextPrimary.id);
            }
        }

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

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Check ownership
        if (product.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to modify this product'
            });
        }

        await ProductModel.setPrimaryImage(productId, imageId);

        res.json({
            success: true,
            message: 'Primary image updated successfully'
        });
    } catch (error) {
        console.error('Set primary image error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to set primary image'
        });
    }
};

// Add product review
const addReview = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user.id;
        const { rating, review_text } = req.body;

        const product = await ProductModel.findById(productId);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Check if user has purchased this product (optional)
        const canReview = await require('../models/orderModel').canReview(userId, productId);
        
        await ProductModel.addReview(
            productId,
            userId,
            parseInt(rating),
            review_text,
            canReview // verified purchase
        );

        res.json({
            success: true,
            message: 'Review added successfully'
        });
    } catch (error) {
        console.error('Add review error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add review'
        });
    }
};

// Get product reviews
const getReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const product = await ProductModel.findById(productId);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        const reviews = await ProductModel.getReviews(productId, page, limit);

        res.json({
            success: true,
            ...reviews
        });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get reviews'
        });
    }
};

// Update stock
const updateStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;
        const userId = req.user.id;

        const product = await ProductModel.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Check ownership
        if (product.seller_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to update stock'
            });
        }

        await ProductModel.updateStock(id, parseInt(quantity));

        res.json({
            success: true,
            message: 'Stock updated successfully'
        });
    } catch (error) {
        console.error('Update stock error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update stock'
        });
    }
};

// Check stock availability
const checkStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity = 1 } = req.query;

        const available = await ProductModel.checkStock(id, parseInt(quantity));

        const product = await ProductModel.findById(id);

        res.json({
            success: true,
            in_stock: available,
            available_quantity: product?.stock_quantity || 0,
            requested_quantity: parseInt(quantity)
        });
    } catch (error) {
        console.error('Check stock error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check stock'
        });
    }
};

// Get products by seller
const getProductsBySeller = async (req, res) => {
    try {
        const { sellerId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const seller = await UserModel.findById(sellerId);
        if (!seller) {
            return res.status(404).json({
                success: false,
                error: 'Seller not found'
            });
        }

        const result = await ProductModel.findBySeller(sellerId, page, limit);

        res.json({
            success: true,
            seller: {
                id: seller.id,
                name: `${seller.first_name} ${seller.last_name}`,
                store_name: seller.store_name
            },
            ...result
        });
    } catch (error) {
        console.error('Get products by seller error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products by seller'
        });
    }
};

// Get featured products
const getFeaturedProducts = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const products = await ProductModel.getFeatured(limit);

        // Check favorites for authenticated users
        if (req.user) {
            for (const product of products) {
                product.is_favorited = await FavoriteModel.isFavorited(req.user.id, 'product', product.id);
            }
        }

        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        console.error('Get featured products error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch featured products'
        });
    }
};

// Get products by category
const getProductsByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const result = await ProductModel.findAll({ category }, page, limit);

        res.json({
            success: true,
            category,
            ...result
        });
    } catch (error) {
        console.error('Get products by category error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products by category'
        });
    }
};

// Search products
const searchProducts = async (req, res) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query required'
            });
        }

        const result = await ProductModel.findAll({ search: q }, page, limit);

        // Track search
        await require('../models/analyticsModel').trackSearch(
            req.user?.id,
            req.session?.id,
            q,
            { type: 'products' },
            result.data.length
        );

        res.json({
            success: true,
            query: q,
            ...result
        });
    } catch (error) {
        console.error('Search products error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search products'
        });
    }
};

// Get brands list
const getBrands = async (req, res) => {
    try {
        const brands = await ProductModel.getBrands();

        res.json({
            success: true,
            data: brands
        });
    } catch (error) {
        console.error('Get brands error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch brands'
        });
    }
};

// Get categories with counts
const getCategories = async (req, res) => {
    try {
        const categories = await ProductModel.getCategories();

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch categories'
        });
    }
};

// Toggle featured (admin only)
const toggleFeatured = async (req, res) => {
    try {
        const { id } = req.params;

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const product = await ProductModel.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        await ProductModel.update(id, { featured: !product.featured });

        res.json({
            success: true,
            message: `Product ${!product.featured ? 'featured' : 'unfeatured'} successfully`
        });
    } catch (error) {
        console.error('Toggle featured error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle featured status'
        });
    }
};

// Bulk update status (admin/seller)
const bulkUpdateStatus = async (req, res) => {
    try {
        const { product_ids, status } = req.body;
        const userId = req.user.id;

        if (!Array.isArray(product_ids) || product_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Product IDs array required'
            });
        }

        // Verify ownership if not admin
        if (req.user.role !== 'admin') {
            for (const productId of product_ids) {
                const product = await ProductModel.findById(productId);
                if (product.seller_id !== userId) {
                    return res.status(403).json({
                        success: false,
                        error: `You don't have permission to update product ${productId}`
                    });
                }
            }
        }

        await ProductModel.bulkUpdateStatus(product_ids, status);

        res.json({
            success: true,
            message: `${product_ids.length} products updated successfully`
        });
    } catch (error) {
        console.error('Bulk update status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to bulk update products'
        });
    }
};

// Get low stock products
const getLowStock = async (req, res) => {
    try {
        const userId = req.user.id;
        const { threshold = 5 } = req.query;

        // Check if user is seller
        const isSeller = await UserModel.isSeller(userId);
        if (!isSeller) {
            return res.status(403).json({
                success: false,
                error: 'You are not a seller'
            });
        }

        const products = await ProductModel.getLowStock(userId, parseInt(threshold));

        res.json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (error) {
        console.error('Get low stock error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get low stock products'
        });
    }
};

// Get product statistics (admin)
const getProductStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const stats = await ProductModel.query(`
            SELECT 
                COUNT(*) as total_products,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_products,
                SUM(CASE WHEN status = 'out_of_stock' THEN 1 ELSE 0 END) as out_of_stock,
                SUM(CASE WHEN status = 'discontinued' THEN 1 ELSE 0 END) as discontinued,
                AVG(price) as avg_price,
                SUM(view_count) as total_views,
                SUM(purchase_count) as total_sales,
                AVG(rating_avg) as avg_rating,
                COUNT(DISTINCT seller_id) as total_sellers,
                COUNT(DISTINCT brand) as total_brands
            FROM products
            WHERE deleted_at IS NULL
        `);

        // Products by category
        const byCategory = await ProductModel.query(`
            SELECT 
                category,
                COUNT(*) as count,
                SUM(purchase_count) as sales
            FROM products
            WHERE deleted_at IS NULL
            GROUP BY category
        `);

        // Top selling products
        const topSelling = await ProductModel.query(`
            SELECT 
                id, name, sku, purchase_count, price
            FROM products
            WHERE deleted_at IS NULL
            ORDER BY purchase_count DESC
            LIMIT 10
        `);

        // Products created over time (last 30 days)
        const overTime = await ProductModel.query(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as count
            FROM products
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);

        res.json({
            success: true,
            stats: stats[0],
            by_category: byCategory,
            top_selling: topSelling,
            over_time: overTime
        });
    } catch (error) {
        console.error('Get product stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get product statistics'
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
};