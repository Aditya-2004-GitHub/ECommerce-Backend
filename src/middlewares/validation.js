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

// ==================== USER VALIDATION RULES ====================

// Validation for user registration
const validateUserRegistration = [
    body('firstName')
        .trim()
        .notEmpty().withMessage('First name is required.')
        .isLength({ min: 2 }).withMessage('First name must be at least 2 characters long.')
        .isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters.'),

    body('lastName')
        .trim()
        .notEmpty().withMessage('Last name is required.')
        .isLength({ min: 2 }).withMessage('Last name must be at least 2 characters long.')
        .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters.'),

    body('email')
        .trim()
        .isEmail().withMessage('Please provide a valid email address.')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number')
        .matches(/[!@#$%^&amp;*]/).withMessage('Password must contain at least one special character (!@#$%^&amp;*)'),

    body('role')
        .optional()
        .isIn(['customer', 'vendor', 'admin']).withMessage('Invalid role'),

    handleValidationErrors
];

const validateUserLogin = [
    body('email')
        .trim()
        .isEmail().withMessage('Please provide a valid email address.')
        .normalizeEmail(),

    body('password')
        .notEmpty().withMessage('Password is required.'),

    handleValidationErrors
];

// Validation for updating user profile
const validateProfileUpdate = [
    body('firstName')
        .optional()
        .trim()
        .isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),

    body('lastName')
        .optional()
        .trim()
        .isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),

    body('phone')
        .optional()
        .trim()
        .matches(/^\d{10}$/).withMessage('Phone number must be 10 digits'),

    body('bio')
        .optional()
        .trim()
        .isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters'),

    body('gender')
        .optional()
        .isIn(['male', 'female', 'other']).withMessage('Invalid gender'),

    handleValidationErrors
];

// Validation for password change
const validatePasswordChange = [
    body('oldPassword')
        .notEmpty().withMessage('Current password is required'),

    body('newPassword')
        .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number'),

    handleValidationErrors
];

// Validation for adding address
const validateAddAddress = [
    body('type')
        .notEmpty().withMessage('Address type is required')
        .isIn(['home', 'office', 'other']).withMessage('Invalid address type'),

    body('street')
        .trim()
        .notEmpty().withMessage('Street address is required'),

    body('city')
        .trim()
        .notEmpty().withMessage('City is required'),

    body('state')
        .trim()
        .notEmpty().withMessage('State is required'),

    body('postalCode')
        .trim()
        .notEmpty().withMessage('Postal code is required')
        .matches(/^\d{6}$/).withMessage('Postal code must be 6 digits'),

    body('country')
        .trim()
        .notEmpty().withMessage('Country is required'),

    handleValidationErrors
];

// Validation for vendor info update
const validateVendorInfo = [
    body('storeName')
        .trim()
        .notEmpty().withMessage('Store name is required')
        .isLength({ min: 3 }).withMessage('Store name must be at least 3 characters'),

    body('gstNumber')
        .trim()
        .notEmpty().withMessage('GST number is required')
        .matches(/^\d{15}$/).withMessage('GST number must be 15 digits'),

    body('bankDetails.accountNumber')
        .trim()
        .notEmpty().withMessage('Account number is required')
        .matches(/^\d{9,18}$/).withMessage('Invalid account number format'),

    body('bankDetails.ifscCode')
        .trim()
        .notEmpty().withMessage('IFSC code is required')
        .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('Invalid IFSC code format'),

    handleValidationErrors
];

module.exports = { validateUserRegistration, validateUserLogin, validateProfileUpdate, validatePasswordChange, validateAddAddress, validateVendorInfo };