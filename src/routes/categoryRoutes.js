const express = require('express');
const router = express.Router();

const categoryController = require('../controllers/categoryController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateCategory } = require('../middlewares/productValidation');
const { upload } = require('../config/cloudinary');

// ==================== PUBLIC ROUTES ====================

// Get all categories
router.get('/', categoryController.getAllCategories);

// Get category tree
router.get('/tree', categoryController.getCategoryTree);

// get rooot category
router.get('/root', categoryController.getRootCategories);

// get single category
router.get('/:id', categoryController.getCategory);

// ==================== ADMIN ROUTES ====================

router.use(authenticate, authorize('admin'));

// Create category
router.post('/', validateCategory, categoryController.createCategory);

// Update Category
router.put('/:id', categoryController.updateCategory);

// Upload category image
router.post('/:id/image', upload.single('image'), categoryController.uploadCategoryImage);

// Delete category
router.delete('/:id', categoryController.deleteCategory);

module.exports = router