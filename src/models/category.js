const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Categpryy name is required.'],
        trim: true,
        unique: true,
        minlength: [2, 'Category name must be atleast 2 characters.'],
        maxlength: [100, 'Category length cannot exceed 100 characters.']
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true
    },
    description: {
        type: String,
        maxlength: [500, 'Description cannot exceed 500 characters.']
    },

    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    categoryPath: {
        type: String,
        index: true
    },
    level: {
        type: Number,
        default: 0 // 0 = root, 1 = subcategory, 2 = sub-subcategory
    },
    images: {
        publicId: String,
        url: String
    },
    metaTitle: String,
    metaDescription: String,
    metaKeyword: String,
    isActive: {
        type: Boolean,
        default: true
    },
    displayOrder: {
        type: Number,
        default: 0
    },
    productCount: {
        type: Number,
        default: 0
    },
},
    { timestamps: true }
);

// ===================== INDEXES =====================
categorySchema.index({ name: 1 });
categorySchema.index({ slug: 1 });
categorySchema.index({ parent: 1 });
categorySchema.index({ categoryPath: 1 });
categorySchema.index({ isActive: 1, displayOrder: 1 });

// ===================== MIDDLEWARES =====================
categorySchema.pre('save', function (next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+$/g, '');
    }
    next();
});

// Build category path before saving
categorySchema.pre('save', async function (next) {
    if (!this.isModified('parent') || !this.isModified('name')) {
        if (!this.parent) {
            this.categoryPath = `/${this.slug}`;
            this.level = 0
        } else {
            const parent = await mongoose.model('Category').findById(this.parent);
            if (parent) {
                this.categoryPath = `${parent.categoryPath}/${this.slug}`;
                this.level = parent.level + 1;
            }
        }
    }
    next();
});

// ===================== INSTANCE METHODS =====================

/**
 * Get all children categories
 */
categorySchema.methods.getChildren = async function () {
    return await mongoose.model('Category').find({
        parent: this._id,
        isActive: true
    }).sort({ displayOrder: 1 });
};

/**
 * get full category tree from  root
 */
categorySchema.methods.getAncestors = async function () {
    const ancestors = [];
    let current = this;

    while (current.parent) {
        current = await mongoose.model('Category').findById(current.parent);
        if (current) {
            ancestors.unshift(current);
        }
    }
    return ancestors;
};

/**
 * Check if category has children
 */
categorySchema.methods.hasChildren = async function () {
    const count = await mongoose.model('Category').countDocuments({
        parent: this._id
    });
    return count > 0;
};

// ===================== STATIC METHODS =====================
/**
 * Get root categories
 */
categorySchema.statics.getRootCategories = async function () {
    return await this.find({
        parent: null,
        isActive: true
    }).sort({ displayOrder: 1 })
};

/**
 * Get category tree
 */
categorySchema.statics.getCategoryTree = async function () {
    const categories = await this.find({ isActive: true })
        .sort({ displayOrder: 1 })
        .lean();

    const buildTree = (parentId = null) => {
        return categories
            .filter(cat => {
                if (parentId === null) return cat.parent === null;
                return cat.parent && cat.parent.toString() === parentId.toString();
            })
            .map(cat => ({
                ...cat,
                children: buildTree(cat._id)
            }));
    };
    return buildTree();
};

/**
 * Get categories by path pattern
 */
categorySchema.statics.findByPath = async function (pathPattern) {
    return await this.find({
        categoryPath: new RegExp(`^${pathPattern}`, 'i'),
        isActive: true
    });
};

/**
 * Update product count
 */
categorySchema.statics.updateProductCount = async function (categoryId) {
    const Product = mongoose.model('Product');
    const count = await Product.countDocuments({
        category: categoryId,
        isActive: true
    });
    await this.findByIdAndUpdate(categoryId, { productCount: count });
};

const Category = mongoose.model('Category', categorySchema);
module.exports = Category;