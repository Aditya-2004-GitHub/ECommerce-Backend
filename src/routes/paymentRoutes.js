const express = require('express');
const router = express.Router();

const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middlewares/auth');

// All payment routes require authentication
router.use(authenticate);

// ==================== CUSTOMER ROUTES ====================

// Create Razorpay order
router.post('/create-order', paymentController.createPaymentOrder);

// Verify payment
router.post('/verify', paymentController.verifyPayment);

// Payment failure
router.post('/failure', paymentController.paymentFailure);

// ==================== ADMIN ROUTES ====================

// Initiate refund
router.post('/refund', authorize('admin'), paymentController.initiateRefund);

// Get payment detaild
router.get('/:paymentId', authorize('admin'), paymentController.getPaymentDetails);

module.exports = router;