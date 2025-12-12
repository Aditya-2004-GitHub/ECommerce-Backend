const User = require('../models/user');
const jwt = require('jsonwebtoken');
const { cloudinary } = require('../config/cloudinary');
const mongoose = require('mongoose');

/**
 * Register a new user
 */
const registerUser = async (req, res, next) => {
    try {
        const { firstName, lastName, email, password, role } = req.body;

        // Ckeck if user already registered
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists.'
            });
        }

        // Create new user
        const user = new User({
            firstName,
            lastName,
            email,
            password,
            role: role || 'customer'
        });

        await user.save();

        // Genrate tokens
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        // Store refresh token in database
        user.refreshTokens.push({ token: refreshToken });
        await user.save();

        return res.status(201).json({
            success: true,
            message: 'User registered successfully.',
            data: {
                user: user.getPublicProfile(),
                tokens: {
                    accessToken,
                    refreshToken
                }
            }
        });
    } catch (error) {
        next(error);
    }
}

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user and compare password
        const user = await User.findByCredentials(email, password);

        // Check if account is active
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        // genrate tokens
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        // Store refresh token in database
        user.refreshTokens.push({ token: refreshToken });
        user.lastLogin = Date.now();
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Login successful.',
            data: {
                user: user.getPublicProfile(),
                tokens: {
                    accessToken,
                    refreshToken
                }
            }
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: error.message
        });
    }
}

const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required.'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

        // Find User
        const user = await User.findById(decoded.id);

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'invalid refresh token.'
            });
        }

        // Check if refresh token exists in database
        const tokenExists = user.refreshTokens.some(rt => rt.token === refreshToken);

        if (!tokenExists) {
            return res.status(401).json({
                success: false,
                message: 'refresh token not found or expired.'
            });
        }

        // Generate new access token
        const newAccessToken = user.generateAccessToken();

        return res.status(200).json({
            success: true,
            message: "New access token generated successfully.",
            data: {
                accessToken: newAccessToken
            }
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired refresh token.'
        })
    }
}

/**
 * Log out user
 */
const logout = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const userId = req.userId;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        // Remove refresh token from database
        user.refreshTokens = user.refreshTokens.filter(rt => rt.token !== refreshToken);
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Logged out successfully.'
        });
    } catch (error) {
        next(error);
    }
}

// ==================== PROFILE CONTROLLERS ====================

/**
* Get user profile
*/
const getProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            })
        }

        return res.status(200).json({
            success: true,
            message: 'User profile fetched successfully.',
            data: {
                user: user.getPublicProfile()
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * User profile update
 */
const updateProfile = async (req, res, next) => {
    try {
        const { firstName, lastName, phone, bio, gender, dateOfBirth, socialLinks } = req.body;
        const userId = req.userId;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;
        if (phone) user.phone = phone;
        if (bio) user.bio = bio;
        if (gender) user.gender = gender;
        if (dateOfBirth) user.dateOfBirth = dateOfBirth;
        if (socialLinks) user.socialLinks = { ...user.socialLinks, ...socialLinks };

        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully.',
            data: {
                user: user.getPublicProfile()
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Upload profile photo
 */
const uploadProfilePhoto = async (req, res, next) => {
    try {
        const userId = req.userId;
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded.'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        // Delete existing photo from cloudinary
        if (user.profilePhoto && user.profilePhoto.publicId) {
            try {
                await cloudinary.uploader.destroy(user.profilePhoto.publicId);
            } catch (error) {
                console.log('Error deleting old photo: ', err)
            }
        }

        // Update profile photo with new URL from multer/cloudinary
        user.profilePhoto = {
            publicId: req.file.filename || req.file.public_id,
            url: req.file.path || req.file.secure_url
        }

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Profile photo updated successfully.",
            data: {
                profilePhoto: user.profilePhoto
            }
        });
    } catch (error) {
        next(error);
    }
}

// ==================== PASSWORD CONTROLLERS ====================

/**
 * Chaneg password
 */
const changePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const userId = req.userId;

        const user = await User.findById(userId).select("+password");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        // Compare old password
        const isPasswordCorrect = await user.comparePassword(oldPassword);
        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: "Current password is inccorect."
            });
        }

        user.password = newPassword;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password update successfully."
        });
    } catch (error) {
        next(error)
    }
}

// ==================== ADDRESS CONTROLLERS ====================
/**
 * Add new address
 */
const addAddress = async (req, res, next) => {
    try {
        const { type, street, city, state, postalCode, country, isDefault } = req.body;
        const userId = req.userId;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        // If this is default, unset all others defaults
        if (isDefault) {
            user.addresses.forEach(addr => {
                addr.isDefault = false
            });
        }

        const newAddress = {
            _id: new mongoose.Types.ObjectId(),
            type,
            street,
            city,
            state,
            postalCode,
            country,
            isDefault: isDefault || user.addresses.length === 0
        }

        user.addresses.push(newAddress);
        await user.save();

        return res.status(201).json({
            success: true,
            message: "Address added successfully.",
            data: {
                address: newAddress
            }
        })
    } catch (error) {
        next(error);
    }
}

/**
 * Get all addresses
 */
const getAddresses = async (req, res, next) => {
    try {
        const userId = req.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Addresses fetch successfully.",
            data: {
                addresses: user.addresses
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Update address
 */
const updateAddress = async (req, res, next) => {
    try {
        const { addressId } = req.params;
        const userId = req.userId;
        const updates = req.body || {};

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Find subdocument by id
        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        // If updates include isDefault truthy, unset all other defaults
        // Coerce strings like "true"/"false" if necessary
        // const isDefault = updates.hasOwnProperty('isDefault')
        //     ? (updates.isDefault === true || updates.isDefault === 'true' || updates.isDefault === 1 || updates.isDefault === '1')
        //     : false;

        if (updates.isDefault) {
            user.addresses.forEach(a => {
                a.isDefault = false;
            });
            address.isDefault = true; // make this one default below (or will be set by Object.assign)
        }

        // Prevent changing _id
        if (updates._id) delete updates._id;

        // Only allow a white-list of fields to be updated (prevent accidental overwrite)
        const allowed = ['type', 'street', 'city', 'state', 'postalCode', 'country', 'isDefault'];
        for (const key of Object.keys(updates)) {
            if (!allowed.includes(key)) {
                delete updates[key];
            }
        }

        // Apply updates to the address subdocument
        Object.assign(address, updates);

        // If you want to ensure mongoose notices deep changes, you can markModified (usually not needed for subdocs)
        // user.markModified('addresses');

        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Address updated.',
            data: address
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete address
 */
const deleteAddress = async (req, res, next) => {
    try {
        const userId = req.userId;
        const { addressId } = req.params;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const originalLength = user.addresses.length;
        user.addresses = user.addresses.filter(a => a._id.toString() !== addressId);
        if (user.addresses.length === originalLength) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Address deleted successfully."
        });
    } catch (error) {
        next(error);
    }
}

// ==================== VENDOR CONTROLLERS ====================


// Helper: ensure vendorInfo object exists
function ensureVendorInfo(user) {
    if (!user.vendorInfo || typeof user.vendorInfo !== 'object') {
        user.vendorInfo = {};
    }
}

/**
 * Update vendor information (for vendor role)
 */
const updateVendorInfo = async (req, res, next) => {
    try {
        const userId = req.userId;
        // Accept bankDetails from client (camelCase) but map to schema field name below if needed
        const { storeName, storeDescription, businessRegistraion, gstNumber, bankDetails } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (user.role !== 'vendor') {
            return res.status(403).json({ success: false, message: "Only vendors can change this information." });
        }

        // ensureVendorInfo(user);

        // update only provided top-level fields
        if (storeName !== undefined) user.vendorInfo.storeName = storeName;
        if (storeDescription !== undefined) user.vendorInfo.storeDescription = storeDescription;
        if (businessRegistraion !== undefined) user.vendorInfo.businessRegistraion = businessRegistraion;
        if (gstNumber !== undefined) user.vendorInfo.gstNumber = gstNumber;

        // bankDetails (incoming) -> map to schema's bankdetails
        if (bankDetails !== undefined) {
            if (typeof bankDetails !== 'object' || bankDetails === null) {
                return res.status(400).json({ success: false, message: "bankDetails must be an object." });
            }
            // preserve existing subfields and merge
            user.vendorInfo.bankdetails = {
                ...user.vendorInfo.bankdetails,
                ...bankDetails
            };
        }

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Vendor information updated successfully.",
            data: { vendorInfo: user.vendorInfo }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Upload store logo
 */
const uploadLogo = async (req, res, next) => {
    try {
        const userId = req.userId;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (user.role !== 'vendor') {
            return res.status(403).json({
                success: false,
                message: "Only vendors can upload logo."
            });
        }

        // Delete old logo
        if (user.vendorInfo.storeLogo && user.vendorInfo.storeLogo.publicId) {
            try {
                await cloudinary.uploader.destroy(user.vendorInfo.storeLogo.publicId);
            } catch (error) {
                console.log("Error deleting old logo: ", error);
            }
        }

        // Upload logo
        user.vendorInfo.storeLogo = {
            publicId: req.file.filename || req.file.public_id,
            url: req.file.path || req.file.secure_url
        }

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Logo uploaded successfuully.",
            data: {
                storeLogo: user.vendorInfo.storeLogo
            }
        })
    } catch (error) {
        next(error);
    }
}

// ==================== ADMIN CONTROLLERS ====================
/**
 * Get all users (Admin only)
 */
const getAllUsers = async (req, res, next) => {
    try {
        const { role, isActive, page = 1, limit = 10 } = req.query;

        let filter = {}
        if (role) filter.role = role;
        if (isActive !== undefined) filter.isActive = isActive === 'true';

        const skip = (page - 1) * limit;

        const users = await User.find(filter)
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await User.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: {
                users: users.map(user => user.getPublicProfile()),
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
}

/**
 * Get user by id
 */
const getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                user: user.getPublicProfile()
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Delete user (Admin only)
 */
const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        // Delete profile photo from Cloudinary
        if (user.profilePhoto && user.profilePhoto.publicId) {
            try {
                await cloudinary.uploader.destroy(user.profilePhoto.publicId);
            } catch (err) {
                console.error('Error deleting photo:', err);
            }
        }

        // Delete store logo if vendor
        if (user.role === 'vendor' && user.vendorInfo.storeLogo) {
            try {
                await cloudinary.uploader.destroy(user.vendorInfo.storeLogo.publicId);
            } catch (err) {
                console.error('Error deleting logo:', err);
            }
        }

        await User.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        next(error);
    }
}

/**
 * Verify vendor (admin only)
 */
const verifyVendor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isVerified } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (user.role !== 'vendor') {
            return res.status(403).json({
                success: false,
                message: "User is not a vendor."
            });
        }

        user.vendorInfo.isVerified = isVerified;
        if (isVerified) {
            user.vendorInfo.verificationDate = new Date()
        }

        await user.save();
        return res.status(200).json({
            success: true,
            message: `Vendor ${isVerified ? 'verified' : 'unverified'} successfully`,
            data: {
                user: user.getPublicProfile()
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 *  Deactivate/Activate user account (admin only)
 */
const toggleUserStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        user.isActive = isActive;
        await user.save();

        return res.status(200).json({
            success: true,
            message: `User account ${isActive ? 'activated' : 'deactivated'} successfully`,
            data: {
                user: user.getPublicProfile()
            }
        })
    } catch (error) {
        next(error);
    }
}

module.exports = { registerUser, loginUser, refreshToken, logout, getProfile, updateProfile, uploadProfilePhoto, changePassword, addAddress, getAddresses, updateAddress, deleteAddress, updateVendorInfo, uploadLogo, getAllUsers, getUserById, deleteUser, verifyVendor, toggleUserStatus }