const express = require('express');
const router = express.Router();

const couponController = require('../controllers/couponController');
const { authenticate, authorize } = require('../middlewares/auth');
const couponValidation = require('../middlewares/couponValidation');

// ==================== ADMIN ROUTES ====================

// Create coupon
router.post('/', authenticate, authorize('admin'), couponValidation.validateCreateCoupon, couponController.createCoupon);

// Get all coupons
router.get('/', authenticate, authorize('admin'), couponController.getAllCoupons);

// Get single coupon
router.get('/:id', authenticate, authorize('admin'), couponController.getCoupon);

// Update coupon
router.put('/:id', authenticate, authorize('admin'), couponValidation.validateUpdateCoupon, couponController.updateCoupon);

// Delete / deactivate coupon
router.delete('/:id', authenticate, authorize('admin'), couponController.deleteCoupon);

// Get coupon analytics
router.get('/:id/analytics', authenticate, authorize('admin'), couponController.getCouponAnalytics);

// ==================== USER ROUTES ====================

// Get available coupons
router.get('/available/list', authenticate, couponController.getAvailableCoupons);

// Validate coupon
router.post('/validate', authenticate, couponValidation.validateValidateCoupon, couponController.validateCoupon);

// Apply coupon to order
router.post('/apply', authenticate, couponValidation.validateApplyCoupon, couponController.applyCoupon);

// Remove Coupon
router.post('/remove/:orderId', authenticate, couponController.removeCoupon);

module.exports = router;