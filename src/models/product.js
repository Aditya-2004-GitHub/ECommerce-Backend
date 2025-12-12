const mongoose = require('mongoose');

// Variant Schema (for size, color variations)
const variantSchema = new mongoose.Schema(
    {
        sku: {
            type: String
        },
        size: String,
        color: String,
        price: {
            type: Number,
            required: true,
            min: 0
        },
        mrp: {
            type: Number,
            required: true,
            min: 0
        },
        stock: {
            type: Number,
            required: true,
            default: 0,
            min: 0
        },
        images: [{
            publicId: String,
            url: String
        }],
        isAvailable: {
            type: Boolean,
            default: true
        }
    }
);

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: [3, 'Product name must be atleast 3 characters.'],
            maxlength: [200, 'Product name cannot exceed 200 caracters.']
        },
        slug: {
            type: String,
            unique: true,
            lowercase: true
        },
        description: {
            type: String,
            required: true,
            minlength: [10, 'Description must be atleast 10 characters.']
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: [true, 'Product category is required.']
        },
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        price: {
            type: Number,
            required: [true, 'Product price is required.'],
            min: 0
        },
        mrp: {
            type: Number,
            required: [true, 'MRP is required.'],
            min: 0
        },
        discount: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        stock: {
            type: Number,
            required: true,
            default: 0,
            min: 0
        },
        lowStockThreshold: {
            type: Number,
            default: 10
        },
        hasVariants: {
            type: Boolean,
            default: false
        },
        variants: [variantSchema],
        images: [{
            publicId: String,
            url: String,
            isPrimary: {
                type: Boolean,
                default: false
            }
        }],
        specifications: {
            type: Map,
            of: String
        },
        brand: {
            type: String,
            trim: true
        },
        tags: [String],
        dimentions: {
            length: Number,
            width: Number,
            height: Number,
            unit: {
                type: String,
                enum: ['cm', 'inch'],
                default: 'cm'
            }
        },
        weight: {
            value: Number,
            unit: {
                type: String,
                enum: ['g', 'kg'],
                default: 'kg'
            }
        },
        rating: {
            average: {
                type: Number,
                default: 0,
                min: 0,
                max: 5
            },
            count: {
                type: Number,
                default: 0
            }
        },
        reviewCount: {
            type: Number,
            default: 0
        },

        // Sales Stats
        totalSold: {
            type: Number,
            default: 0
        },
        views: {
            type: Number,
            default: 0
        },

        // Status
        isActive: {
            type: Boolean,
            default: true
        },
        isOutOfStock: {
            type: Boolean,
            default: false
        },

        // SEO
        metaTitle: String,
        metaDescription: String,
        metaKeywords: [String],

        // Shipping
        freeShipping: {
            type: Boolean,
            default: false
        },
        shippingCharge: {
            type: Number,
            default: 0
        },
        returnable: {
            type: Boolean,
            default: true
        },
        returnPeriod: {
            type: Number,
            default: 7 // days
        },
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        approvedAt: Date
    },
    { timestamps: true }
);

// ==================== INDEXES ====================
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ seller: 1 });
productSchema.index({ slug: 1 });
productSchema.index({ price: 1 });
productSchema.index({ 'rating.average': -1 });
productSchema.index({ totalSold: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ approvalStatus: 1 });

// Remove the old index and add sparse index
productSchema.index({ 'variants.sku': 1 }, {
    unique: true,
    sparse: true
});

// Add validation middleware
productSchema.pre('save', function (next) {
    if (this.hasVariants && this.variants.length > 0) {
        const skus = this.variants.map(v => v.sku);

        // Check if all variants have SKU
        if (skus.some(sku => !sku)) {
            return next(new Error('All variants must have a SKU when hasVariants is true'));
        }

        // Check for duplicate SKUs within the product
        const uniqueSkus = new Set(skus);
        if (uniqueSkus.size !== skus.length) {
            return next(new Error('Duplicate SKUs found in variants'));
        }
    }
    next();
});

// ==================== MIDDLEWARES ====================

// Generate slug before saving
productSchema.pre('save', function (next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    next();
});

// Calculate discount percentage
productSchema.pre('save', function (next) {
    if (this.mrp && this.price) {
        this.discount = Math.round(((this.mrp - this.price) / this.mrp) * 100);
    }
    next();
});

// Check if out of stock
productSchema.pre('save', function (next) {
    if (this.hasVariants) {
        const totalStock = this.variants.reduce((sum, v) => sum + v.stock, 0);
        this.isOutOfStock = totalStock === 0;
        this.stock = totalStock;
    } else {
        this.isOutOfStock = this.stock === 0;
    }
    next();
});

// ==================== INSTANCE METHODS ====================

/**
 * Get available variants
 */
productSchema.methods.getAvailableVariants = function () {
    return this.variants.filter(v => v.isAvailable && v.stock > 0);
};

/**
 * Update stock after order
 */
productSchema.methods.decreaseStock = async function (quantity, variantSku = null) {
    if (this.hasVariants && variantSku) {
        const variant = this.variants.find(v => v.sku === variantSku);
        if (variant) {
            variant.stock -= quantity;
            if (variant.stock === 0) {
                variant.isAvailable = false;
            }
        }
    } else {
        this.stock -= quantity;
    }
    await this.save();
};

/**
* Increase stock (refund/return)
*/
productSchema.methods.increaseStock = async function (quantity, variantSku = null) {
    if (this.hasVariants && variantSku) {
        const variant = this.variants.find(v => v.sku === variantSku);
        if (variant) {
            variant.stock += quantity;
            variant.isAvailable = true;
        }
    } else {
        this.stock += quantity;
    }
    await this.save();
};

/**
 * Increment view count
 */
productSchema.methods.incrementViews = function () {
    this.views += 1;
    return this.save();
};

/**
 * Get prime image
 */
productSchema.methods.getPrimaryImage = function () {
    if (!this.images || !Array.isArray(this.images) || this.images.length === 0) {
        return null;
    }

    const primary = this.images.find(img => img.isPrimary);
    return primary || this.images[0];
};

// ==================== STATIC METHODS ====================

/**
* Get featured products
*/
productSchema.statics.getFeaturedProducts = async function (limit = 10) {
    return await this.find({
        isFeatured: true,
        isActive: true,
        approvalStatus: 'approved',
        isOutOfStock: false
    })
        .limit(limit)
        .populate('category', 'name slug')
        .populate('seller', 'firstName lastName vendorInfo.storeName')
        .sort({ totalSold: -1 });
};

/**
* Get products by category
*/
productSchema.statics.getByCategory = async function (categoryId, options = {}) {
    const {
        page = 1,
        limit = 20,
        sort = { createdAt: -1 },
        minPrice,
        maxPrice
    } = options;
    const query = {
        category: categoryId,
        isActive: true,
        approvalStatus: 'approved'
    };
    if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = minPrice;
        if (maxPrice) query.price.$lte = maxPrice;
    }
    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
        this.find(query)
            .skip(skip)
            .limit(limit)
            .sort(sort)
            .populate('category', 'name slug')
            .populate('seller', 'firstName lastName'),
        this.countDocuments(query)
    ]);
    return {
        products,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit)
        }
    }
};

/**
* Search products
*/
productSchema.statics.searchProducts = async function (searchQuery, options = {}) {
    const {
        page = 1,
        limit = 20,
        category,
        minPrice,
        maxPrice,
        sort = { _id: -1 }
    } = options;
    const query = {
        $text: { $search: searchQuery },
        isActive: true,
        approvalStatus: 'approved'
    };
    if (category) query.category = category;
    if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = minPrice;
        if (maxPrice) query.price.$lte = maxPrice;
    }
    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
        this.find(query, { score: { $meta: 'textScore' } })
            .skip(skip)
            .limit(limit)
            .sort(sort)
            .populate('category', 'name')
            .populate('seller', 'firstName lastName'),
        this.countDocuments(query)
    ]);
    return {
        products,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit)
        }
    };
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;