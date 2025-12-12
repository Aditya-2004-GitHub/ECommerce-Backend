const Product = require('../models/product');
const Category = require('../models/category');
const { cloudinary } = require('../config/cloudinary');

// ==================== CREATE PRODUCT ====================

/**
* Create new product
* POST /api/products
* Access: Vendor, Admin
*/
const createProduct = async (req, res, next) => {
    try {
        const { name, description, category, price, mrp, stock, brand, specifications, tags, freeShipping, returnable, hasVariants, variants } = req.body;

        // Verify category exists
        const isCategory = await Category.findById(category);
        if (!isCategory) {
            return res.status(404).json({
                success: false,
                message: 'Category not found.'
            });
        }

        // Create product
        const product = await Product.create({
            name,
            description,
            category,
            seller: req.userId, // From auth middleware
            price,
            mrp,
            stock,
            brand,
            specifications,
            tags,
            freeShipping,
            returnable,
            hasVariants,
            variants,
            approvalStatus: req.user.role === 'admin' ? 'approved' : 'pending'
        });

        // Update product count
        await Category.updateProductCount(category);

        return res.status(201).json({
            success: true,
            message: 'Product added successfully.',
            data: { product }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== GET ALL PRODUCTS ====================

/**
* Get all products with filters
* GET /api/products
* Access: Public
*/
const getAllProducts = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, category, minPrice, maxPrice, brand, search, sort = 'createdAt', order = 'desc', isFeatured } = req.query;

        // Build query
        const query = {
            isActive: true,
            approvalStatus: 'approved'
        }

        if (category) query.category = category;
        if (brand) query.brand = brand;
        if (isFeatured !== undefined) query.isFeatured = isFeatured === 'true';

        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }
        if (search) {
            query.$text = { $search: search };
        }

        const skip = (page - 1) * limit;

        // Sort options
        const sortOptions = {};
        sortOptions[sort] = order === 'desc' ? -1 : 1;

        const [products, total] = await Promise.all([
            Product.find(query)
                .skip(skip)
                .limit(parseInt(limit))
                .sort(sortOptions)
                .populate('category', 'name slug')
                .populate('seller', 'firstName lastName vendorInfo.sortName'),
            Product.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            data: {
                products,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== GET SINGLE PRODUCT ====================

/**
* Get product by ID or slug
* GET /api/products/:id
* Access: Public
*/
const getProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Try id first, then slug
        let product = await Product.findById(id)
            .populate('category', 'name slug categoryPath')
            .populate('seller', 'firstName lastName vendorInfo.storeName vendorInfo.isVerified');

        if (!product) {
            product = await Product.findOne({ slug: id })
                .populate('category', 'name slug categoryPath')
                .populate('seller', 'firstName lastName vendorInfo.storeName vendorInfo.isVerified');
        }

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        await product.incrementViews();

        return res.status(200).json({
            success: true,
            data: { product }
        });
    } catch (error) {
        next(error);
    }
}

// ==================== UPDATE PRODUCT ====================

/**
* Update product
* PUT /api/v1/products/:id
* Access: Vendor (own products), Admin
*/
const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        // Check ownership (vendor can only update own products)
        if (req.user.role === 'vendor' && product.seller.toString !== req.userId) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to update this product."
            });
        }

        // Update fields
        Object.keys(updates).forEach(key => {
            if (key !== 'seller' && key !== 'approvalStatus') {
                product[key] = updates[key];
            }
        });

        // If vendor updates, reset approval status
        if (req.user.role === 'vendor') {
            product.approvalStatus = 'pending';
        }
        await product.save();

        return res.status(200).json({
            success: true,
            message: 'Product updated successfully.',
            data: { product }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== UPLOAD PRODUCT IMAGES ====================

/**
* Upload product images
* POST /api/products/:id/images
* Access: Vendor (own products), Admin
*/
const uploadProductImages = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded.'
            });
        }

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found.'
            });
        }

        // Check ownership
        if (req.user.role === 'vendor' && product.seller.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized.'
            });
        }

        // Add new images
        const newImages = req.files.map((file, index) => ({
            publicId: file.fileName || file.public_id,
            url: file.path || file.secure_url,
            isPrimary: product.images.length === 0 && index === 0
        }));

        product.images.push(...newImages);
        await product.save();

        return res.status(200).json({
            success: true,
            message: 'Images uploaded successfully.',
            data: {
                images: product.images
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== UPLOAD PRODUCT VARIANT IMAGES ====================

/**
* Upload product images
* POST /api/products/:productId/:variantId/images
* Access: Vendor (own products), Admin
*/
const uploadVariantImages = async (req, res, next) => {
    try {
        const { productId, variantId } = req.params;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded.'
            });
        }

        const product = await Product.findOne({ _id: productId, "variants._id": variantId });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found.'
            });
        }

        // Check ownership
        if (req.user.role === 'vendor' && product.seller.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized.'
            });
        }

        const variant = product.variants.id(variantId);

        if (!variant) {
            return res.status(404).json({
                success: false,
                message: 'Variant not found.'
            });
        }


        // Prepare new image objects; determine isPrimary per-variant
        // If variant has no images before upload, make the first uploaded file primary
        const hadImagesBefore = Array.isArray(variant.images) && variant.images.length > 0;

        const newImages = req.files.map((file, index) => ({
            publicId: file.filename || file.fileName || file.public_id || null,
            url: file.path || file.location || file.secure_url || null,
            isPrimary: !hadImagesBefore && index === 0
        }));

        // Ensure variant.images exists
        if (!Array.isArray(variant.images)) variant.images = [];

        variant.images.push(...newImages);
        await product.save();

        return res.status(200).json({
            success: true,
            message: 'Variant images uploaded successfully.',
            data: {
                images: product.variants
            }
        });
    } catch (error) {
        next(error);
    }
}

// ==================== DELETE PRODUCT ====================
/**
* Delete product
* DELETE /api/products/:id
* Access: Vendor (own products), Admin
*/
const deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found.'
            });
        }

        // check ownership
        if (req.user.role === 'vendor' && product.seller.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized.'
            });
        }

        // Delete images from cloudinary
        for (const image of product.images) {
            if (image.publicId) {
                try {
                    await cloudinary.uploader.destroy(image.publicId);
                } catch (error) {
                    console.log("Error deleting images: ", error);
                }
            }
        }

        await Product.findByIdAndDelete(id);

        // Update category product count
        await Category.updateProductCount(product.category);

        return res.status(200).json({
            success: true,
            message: 'Product deleted successfully.'
        })
    } catch (error) {
        next(error);
    }
}

// ==================== APPROVE PRODUCT (ADMIN) ====================

/**
* Approve/Reject product
* PUT /api/products/:id/approve
* Access: Admin only
*/
const approveProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { approvalStatus } = req.body;

        if (!['approved', 'rejected'].includes(approvalStatus)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid approval status.'
            });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        product.approvalStatus = approvalStatus;
        product.approvedBy = req.userId;
        product.approvedAt = new Date();

        await product.save();
        return res.status(200).json({
            success: true,
            message: `Product ${approvalStatus} successfully.`,
            data: { product }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== GET VENDOR PRODUCTS ====================

/**
* Get vendor's own products
* GET /api/products/vendor/my-products
* Access: Vendor only
*/
const getVendorProducts = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status } = req.query;

        const query = { seller: req.userId };
        if (status) query.approvalStatus = status;

        const skip = (page - 1) * limit;

        const [product, total] = await Promise.all([
            Product.find(query)
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ createdAt: -1 })
                .populate('category', 'name slug'),
            Product.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            data: {
                product,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { createProduct, getAllProducts, getProduct, updateProduct, uploadProductImages, uploadVariantImages, deleteProduct, approveProduct, getVendorProducts }