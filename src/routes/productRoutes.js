const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');
const { authenticate, authorize, optionalAuth } = require('../middlewares/auth');
const { validateProduct } = require('../middlewares/productValidation');
const { upload } = require('../config/cloudinary');

// ==================== PUBLIC ROUTES ====================

// Get all products
router.get('/', productController.getAllProducts);

// Get single product
router.get('/:id', productController.getProduct);

// ==================== VENDOR ROUTES ====================

// Get vendor products
router.get('/vendor/my-products', authenticate, authorize('vendor'), productController.getVendorProducts)

// Create product
router.post('/', authenticate, authorize('vendor', 'admin'), validateProduct, productController.createProduct);

// Update product
router.put('/:id', authenticate, authorize('vendor', 'admin'), productController.updateProduct);

// Upload product images
router.post('/:id/images', authenticate, authorize('vendor', 'admin'), upload.array('images', 6), productController.uploadProductImages);

// Upload variant images
router.post('/:productId/:variantId/images', authenticate, authorize('vendor', 'admin'), upload.array('images', 6), productController.uploadVariantImages);

// Delete product
router.delete('/:id', authenticate, authorize('vendor', 'admin'), productController.deleteProduct);

// ==================== ADMIN ROUTES ====================

// Approve/Reject product
router.put('/:id/approve', authenticate, authorize('admin'), productController.approveProduct);

module.exports = router;