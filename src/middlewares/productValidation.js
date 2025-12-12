const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map(err => ({
                field: err.param,
                message: err.msg
            }))
        });
    }
    next();
};

const validateCategory = [
    body('name')
        .trim()
        .notEmpty().withMessage('Category name is rerquired.')
        .isLength({ min: 2, max: 100 }).withMessage('Name must br 2-100 characters.'),

    body('parent')
        .optional()
        .isMongoId().withMessage('Invalid parent category ID'),

    body('description')
        .optional()
        .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters.'),

    handleValidationErrors
];

const validateProduct = [
    body('name')
        .trim()
        .notEmpty().withMessage('Product name is required')
        .isLength({ min: 3, max: 200 }).withMessage('Name must be 3-200 characters'),

    body('description')
        .trim()
        .notEmpty().withMessage('Description is required')
        .isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),

    body('category')
        .notEmpty().withMessage('Category is required')
        .isMongoId().withMessage('Invalid category ID'),

    body('price')
        .isFloat({ min: 0 }).withMessage('Price must be a positive number'),

    body('mrp')
        .isFloat({ min: 0 }).withMessage('MRP must be a positive number')
        .custom((value, { req }) => {
            if (value < req.body.price) {
                throw new Error('MRP cannot be less than price');
            }
            return true;
        }),

    body('stock')
        .isInt({ min: 0 }).withMessage('Stock must be a positive integer'),

    handleValidationErrors
]

const validateAddToCart = [
    body('productId')
        .notEmpty().withMessage('Product ID is required')
        .isMongoId().withMessage('Invalid product ID'),

    body('quantity')
        .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),

    body('variantSku')
        .optional()
        .isString(),

    handleValidationErrors
];

// Validate order creation
const validateOrder = [
    body('items')
        .isArray({ min: 1 }).withMessage('Cart must have at least 1 item'),

    body('items.*.product')
        .isMongoId().withMessage('Invalid product ID'),

    body('items.*.quantity')
        .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),

    body('shippingAddress.fullName')
        .trim()
        .notEmpty().withMessage('Full name is required'),

    body('shippingAddress.phone')
        .trim()
        .matches(/^\d{10}$/).withMessage('Phone must be 10 digits'),

    body('shippingAddress.street')
        .trim()
        .notEmpty().withMessage('Street address is required'),

    body('shippingAddress.city')
        .trim()
        .notEmpty().withMessage('City is required'),

    body('shippingAddress.state')
        .trim()
        .notEmpty().withMessage('State is required'),

    body('shippingAddress.postalCode')
        .trim()
        .matches(/^\d{6}$/).withMessage('Postal code must be 6 digits'),

    body('shippingAddress.country')
        .trim()
        .notEmpty().withMessage('Country is required'),

    body('paymentMethod')
        .isIn(['razorpay', 'cod']).withMessage('Invalid payment method'),

    handleValidationErrors
];

module.exports = { validateCategory, validateProduct, validateAddToCart, validateOrder }