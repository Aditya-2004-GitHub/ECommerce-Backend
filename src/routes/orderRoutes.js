const express = require('express');
const router = express.Router();

const orderController = require('../controllers/orderController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateOrder } = require('../middlewares/productValidation');

// All order routes require authentication
router.use(authenticate);

// ==================== CUSTOMER ROUTES ====================

// Create order
router.post('/', validateOrder, orderController.createOrder);

// Get user orders
router.get('/', orderController.getUserOrders);

// Get single order
router.get('/:id', orderController.getOrder);

// Cancel order
router.put('/:id/cancel', orderController.cancelOrder);

// Request return
router.post('/:id/return', orderController.requestReturn);

// ==================== VENDOR ROUTES ====================

// Get vendor's orders
router.get('/vendor/my-orders', authorize('vendor'), orderController.getVendorOrders
);

// ==================== ADMIN/VENDOR ROUTES ====================

// Update order status
router.put('/:id/status', authorize('admin', 'vendor'), orderController.updateOrderStatus
);


module.exports = router;