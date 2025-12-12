const Category = require('../models/category');
const { cloudinary } = require('../config/cloudinary');

// ==================== CREATE CATEGORY ====================

/**
 * Create new Category
 * POST /api/categories
 * Access: Admin only
 */
const createCategory = async (req, res, next) => {
    try {
        const { name, description, parent, metaTitle, metaDescription, metaKeyword } = req.body;

        // Check if category already exists
        const isCategory = await Category.findOne({ name });
        if (isCategory) {
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists.'
            });
        }

        const category = await Category.create({
            name,
            description,
            parent: parent || null,
            metaTitle,
            metaDescription,
            metaKeyword
        });

        return res.status(201).json({
            success: true,
            message: 'Category created successfully.',
            data: { category }
        });
    } catch (error) {
        next(error);
    }
}

// ==================== GET ALL CATEGORIES ====================

/**
* Get all categories (flat list)
* GET /api/categories
* Access: Public
*/
const getAllCategories = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, parent, isActive } = req.query;

        const query = {};
        if (parent !== undefined) query.parent = parent === 'null' ? null : parent;
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const skip = (page - 1) * limit;
        const [categories, total] = await Promise.all([
            Category.find(query)
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ displayOrder: 1, name: 1 })
                .populate('parent', 'name slug categoryPath'),
            Category.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            data: {
                categories,
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
};

// ==================== GET CATEGORY TREE ====================

/**
* Get nested category tree
* GET /api/categories/tree
* Access: Public
*/
const getCategoryTree = async (req, res, next) => {
    try {
        const tree = await Category.getCategoryTree();
        res.status(200).json({
            success: true,
            data: { categories: tree }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== GET ROOT CATEGORIES ====================

/**
* Get top-level categories
* GET /api/categories/root
* Access: Public
*/
const getRootCategories = async (req, res, next) => {
    try {
        const categories = await Category.getRootCategories();

        return res.status(200).json({
            success: true,
            data: { categories }
        })
    } catch (error) {
        next(error);;
    }
};

// ==================== GET SINGLE CATEGORY ====================

/**
* Get category by ID or slug
* GET /api/categories/:id
* Access: Public
*/
const getCategory = async (req, res, next) => {
    try {
        const { id } = req.params;

        // find by id first, then by slug
        let category = await Category.findById(id).populate('parent', 'name slug');
        if(!category){
            category = await Category.findOne({ slug: id }).populate('parent', 'name slug');
        }

        if(!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found.'
            });
        }

        // Get children
        const children = await category.getChildren();

        return res.status(200).json({
            success: true,
            data: {
                category,
                children
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== UPDATE CATEGORY ====================

/**
* Update category
* PUT /api/categories/:id
* Access: Admin only
*/
const updateCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const category = await Category.findById(id);

        if(!category){
            return res.status(404).json({
                success: false,
                message: 'Category not found.'
            });
        }

        // Update fields
        Object.keys(updates).forEach(key => {
            category[key] = updates[key];
        });

        await category.save();

        return res.status(200).json({
            success: true,
            message: 'Category updated successfully.',
            data: { category }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== UPLOAD CATEGORY IMAGE ====================

/**
* Upload category image
* POST /api/categories/:id/image
* Access: Admin only
*/
const uploadCategoryImage = async (req, res, next) => {
    try {
        const { id } = req.params;

        if(!req.file){
            return res.status(400).json({
                success: false,
                message: 'No file uploaded.'
            });
        }

        const category = await Category.findById(id);

        if(!category){
            return res.status(404).json({
                success: false,
                message: 'Category not found.'
            });
        }

        // Delete old image
        if(category.images && category.images.publicId){
            try {
                await cloudinary.uploader.destroy(category.images.publicId);
            } catch (error) {
                console.log("Error deleting old image: ", error);
            }
        }

        // Upload new image
        category.images = {
            publicId: req.file.fileName || req.file.publicId,
            url: req.file.path || req.file.secure_url
        };

        await category.save();

        return res.status(200).json({
            success: true,
            message: 'Category image uploaded successfully.',
            data: {
                image: category.images
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== DELETE CATEGORY ====================

/**
* Delete category
* DELETE /api/categories/:id
* Access: Admin only
*/
const deleteCategory = async (req, res, next) => {
    try {
        const { id } = req.params;

        const category = await Category.findById(id);

        if(!category){
            return res.status(404).json({
                success: false,
                message: "Category not found."
            });
        }

        // Check if category has children
        const hasChildren = await category.hasChildren();
        if(hasChildren){
            return res.status(400).json({
                success: false,
                message: 'Cannot delete category with subcategories.'
            });
        }

        // Check if category has products
        const Product = require('../models/product');
        const hasProduct = await Product.findOne({category: id});
        if(hasProduct){
            return res.status(400).json({
                success: false,
                message: "Cannot delete category with products."
            });
        }

        // Delete image from category
        if(category.images && category.images.publicId){
            try {
                await cloudinary.uploader.destroy(category.images.publicId);
            } catch (error) {
                console.log("Error deleting image: ", error);
            }
        }

        await Category.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: 'Category deleted successfully.'
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { createCategory, getAllCategories, getCategoryTree, getRootCategories, getCategory, updateCategory, uploadCategoryImage, deleteCategory }