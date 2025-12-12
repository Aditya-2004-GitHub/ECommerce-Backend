const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middlewares/auth');
const {
    validateUserRegistration,
    validateUserLogin,
    validateProfileUpdate,
    validatePasswordChange,
    validateAddAddress,
    validateVendorInfo,
} = require('../middlewares/validation');
const { upload } = require('../config/cloudinary');

//  Authentication routes
router.post('/register', validateUserRegistration, userController.registerUser);
router.post('/login', validateUserLogin, userController.loginUser);
router.post('/refresh-token', userController.refreshToken);

router.use(authenticate);
router.post('/logout', userController.logout);

// Profile Routes
router.get('/profile', userController.getProfile);
router.put('/profile', validateProfileUpdate, userController.updateProfile);
router.post('/profile-photo', upload.single('profilePhoto'), userController.uploadProfilePhoto);

// Password routes
router.post('/change-password', validatePasswordChange, userController.changePassword);

// Address routes
router.post('/addresses', validateAddAddress, userController.addAddress);
router.get('/addresses', userController.getAddresses);
router.put('/addresses/:addressId', userController.updateAddress);//not created
router.delete('/addresses/:addressId', userController.deleteAddress);

// Vendor routes
router.put('/vendor-info', authorize('vendor'), validateVendorInfo, userController.updateVendorInfo);
router.post('/upload-logo', authorize('vendor'), upload.single('storeLogo'), userController.uploadLogo);

// Admin routes
router.get('/admin/all-users', authorize('admin'), userController.getAllUsers);
router.get('/admin/user/:id', authorize('admin'), userController.getUserById);
router.delete('/admin/user/:id', authorize('admin'), userController.deleteUser);
router.put('/admin/verify-vendor/:id', authorize('admin'), userController.verifyVendor);
router.put('/admin/user-status/:id', authorize('admin'), userController.toggleUserStatus)


module.exports = router