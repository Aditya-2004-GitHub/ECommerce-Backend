const { body, validationResult } = require('express-validator');

// ==================== CREATE COUPON VALIDATION ====================

const validateCreateCoupon = [
    body('code')
        .notEmpty().withMessage('Coupon code is required')
        .isLength({ min: 3, max: 20 }).withMessage('Code must be 3-20 characters')
        .matches(/^[A-Z0-9]+$/).withMessage('Code must contain only uppercase letters and numbers')
        .trim()
        .toUpperCase(),

    body('description')
        .optional()
        .isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),

    body('discountType')
        .notEmpty().withMessage('Discount type is required')
        .isIn(['percentage', 'fixed']).withMessage('Discount type must be percentage or fixed'),

    body('discountValue')
        .notEmpty().withMessage('Discount value is required')
        .isFloat({ min: 0 }).withMessage('Discount value must be positive')
        .custom((value, { req }) => {
            if (req.body.discountType === 'percentage') {
                if (value < 1 || value > 100) {
                    throw new Error('Percentage discount must be between 1-100');
                }
            } else if (req.body.discountType === 'fixed') {
                if (value < 1 || value > 100000) {
                    throw new Error('Fixed discount must be between ₹1 and ₹100,000');
                }
            }
            return true;
        }),

    body('maxDiscountAmount')
        .custom((value, { req }) => {
            if (req.body.discountType === 'percentage' && !value) {
                throw new Error('maxDiscountAmount is required for percentage coupons');
            }
            if (value && value < 1) {
                throw new Error('maxDiscountAmount must be at least ₹1');
            }
            return true;
        })
        .optional(),

    body('minOrderValue')
        .optional()
        .isFloat({ min: 0 }).withMessage('Minimum order value must be positive'),

    body('maxUsageLimit')
        .optional()
        .isInt({ min: 1 }).withMessage('Max usage limit must be at least 1'),

    body('maxUsagePerUser')
        .optional()
        .isInt({ min: 1 }).withMessage('Max usage per user must be at least 1'),

    body('validFrom')
        .notEmpty().withMessage('Valid from date is required')
        .isISO8601().withMessage('Valid from must be a valid date'),

    body('validUntil')
        .notEmpty().withMessage('Valid until date is required')
        .isISO8601().withMessage('Valid until must be a valid date')
        .custom((value, { req }) => {
            const validFrom = new Date(req.body.validFrom);
            const validUntil = new Date(value);
            const now = new Date();
            if (validUntil <= validFrom) {
                throw new Error('Valid until must be after valid from');
            }
            if (validUntil <= now) {
                throw new Error('Coupon cannot be created with past expiry date');
            }
            return true;
        }),

    body('freeShipping')
        .optional()
        .isBoolean().withMessage('Free shipping must be a boolean'),

    body('combinableWithOtherCoupons')
        .optional()
        .isBoolean().withMessage('Combinable flag must be a boolean')
];

// ==================== UPDATE COUPON VALIDATION ====================

const validateUpdateCoupon = [
    body('description')
        .optional()
        .isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),

    body('discountType')
        .optional()
        .isIn(['percentage', 'fixed']).withMessage('Discount type must be percentage or fixed'),

    body('discountValue')
        .optional()
        .isFloat({ min: 0 }).withMessage('Discount value must be positive'),

    body('maxDiscountAmount')
        .optional()
        .isFloat({ min: 1 }).withMessage('Max discount amount must be at least ₹1'),

    body('minOrderValue')
        .optional()
        .isFloat({ min: 0 }).withMessage('Minimum order value must be positive'),

    body('maxUsageLimit')
        .optional()
        .isInt({ min: 1 }).withMessage('Max usage limit must be at least 1'),

    body('validUntil')
        .optional()
        .isISO8601().withMessage('Valid until must be a valid date')
        .custom((value) => {
            const validUntil = new Date(value);
            const now = new Date();
            if (validUntil <= now) {
                throw new Error('Cannot set past expiry date');
            }
            return true;
        }),

    body('isActive')
        .optional()
        .isBoolean().withMessage('Active status must be a boolean'),

    body('freeShipping')
        .optional()
        .isBoolean().withMessage('Free shipping must be a boolean')
];

// ==================== VALIDATE COUPON VALIDATION ====================

const validateValidateCoupon = [
    body('code')
        .notEmpty().withMessage('Coupon code is required')
        .trim()
        .toUpperCase(),

    body('cartTotal')
        .notEmpty().withMessage('Cart total is required')
        .isFloat({ min: 1 }).withMessage('Cart total must be greater than 0'),

    body('cartItems')
        .optional()
        .isArray().withMessage('Cart items must be an array')
];

// ==================== APPLY COUPON VALIDATION ====================

const validateApplyCoupon = [
    body('couponCode')
        .notEmpty().withMessage('Coupon code is required')
        .trim()
        .toUpperCase(),

    body('orderId')
        .notEmpty().withMessage('Order ID is required')
        .isMongoId().withMessage('Invalid order ID')
];

module.exports = { validateCreateCoupon, validateUpdateCoupon, validateValidateCoupon, validateApplyCoupon }