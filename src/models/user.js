const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const USER_ROLES = {
    CUSTOMER: 'customer',
    VENDOR: 'vendor', // Wholesaler
    ADMIN: 'admin'
}

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: [true, 'First name is required'],
            trim: true,
            minlength: [2, 'First name must be at least 2 characters'],
            maxlength: [50, 'First name cannot exceed 50 characters']
        },
        lastName: {
            type: String,
            required: [true, 'Last name is required'],
            trim: true,
            minlength: [2, 'Last name must be at least 2 characters'],
            maxlength: [50, 'Last name cannot exceed 50 characters']
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address']
        },
        phone: {
            type: String,
            trim: true,
            match: [/^\d{10}$/, 'Please use a valid 10-digit phone number']
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false // Exclude password from query results by default
        },
        profilePhoto: {
            publicId: String,
            url: String
        },
        bio: {
            type: String,
            maxlength: [500, 'Bio cannot exceed 500 characters']
        },
        dateOfBirth: Date,
        gender: {
            type: String,
            enum: ['male', 'female', 'other'],
            default: null
        },
        role: {
            type: String,
            enum: [USER_ROLES.CUSTOMER, USER_ROLES.VENDOR, USER_ROLES.ADMIN],
            default: USER_ROLES.CUSTOMER
        },
        addresses: [
            {
                _id: mongoose.Schema.Types.ObjectId,
                type: {
                    type: String,
                    enum: ['home', 'office', 'other'],
                    default: 'home'
                },
                street: String,
                city: String,
                state: String,
                postalCode: String,
                country: String,
                isDefault: {
                    type: Boolean,
                    default: false
                }
            }
        ],
        vendorInfo: {
            storeName: String,
            storeDescription: String,
            storeLogo: {
                publicId: String,
                url: String,
            },
            businessRegistraion: String,
            gstNumber: String,
            bankdetails: {
                accountHolder: String,
                accountNumber: String,
                bankName: String,
                ifscCode: String
            },
            isVerified: {
                type: Boolean,
                default: false
            },
            verificationDate: Date,
            commissionRate: {
                type: Number,
                default: 10, // Percentage
                min: 0,
                max: 100
            }
        },
        isActive: {
            type: Boolean,
            default: true
        },
        isEmailVerified: {
            type: Boolean,
            default: false
        },
        emailVerificationToken: String,
        emailVerificationTokenExpires: Date,
        refreshTokens: [{
            token: {
                type: String,
                required: true
            },
            createdAt: {
                type: Date,
                default: Date.now,
                expires: 2592000 // 30 days
            }
        }],
        lastLogin: Date,
        passwordChangedAt: Date,
        passwordResetToken: String,
        passwordResetTokenExpires: Date,
        socialLinks: { // Optionals
            twitter: String,
            facebook: String,
            instagram: String,
            linkedin: String,
        },
        emailNotifications: {
            type: Boolean,
            default: true
        },
        smsNotifications: {
            type: Boolean,
            default: true
        },
        // Account Metadata
        totalOrders: {
            type: Number,
            default: 0
        },
        totalSpent: {
            type: Number,
            default: 0
        },
        rating: {
            average: {
                type: Number,
                default: 0,
                min: 0,
                max: 5
            },
            count: {
                type: Number,
                default: 0
            }
        },
        // Timestamps
        createdAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);
// ==================== INDEXES ====================
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

// ==================== MIDDLEWARES ====================
// Hash password before saving (only if password is modified)
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        if (!this.isNew) {
            this.passwordChangedAt = Date.now() - 1000;
        }
        next();
    } catch (error) {
        next(error);
    }
});

// ==================== INSTANCE METHODS ====================
/**
* Compare provided password with hashed password
* @param {String} providedPassword - Password to compare
* @returns {Promise&lt;Boolean&gt;} - True if password matches
*/
userSchema.methods.comparePassword = async function (providedPassword) {
    return await bcrypt.compare(providedPassword, this.password);
}

/**
* Generate JWT Access Token
* @returns {String} - JWT token
*/
userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            id: this._id,
            email: this.email,
            role: this.role
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' },
    );
};

/**
* Generate JWT Refresh Token
* @returns {String} - Refresh token
*/
userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            id: this._id
        },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' },
    );
};

/**
* Get public profile data (exclude sensitive information)
* @returns {Object} - Public user profile
*/
userSchema.methods.getPublicProfile = function () {
    const userObj = this.toObject();
    delete userObj.password;
    delete userObj.refreshTokens;
    delete userObj.emailVerificationToken;
    delete userObj.emailVerificationTokenExpires;
    delete userObj.passwordResetToken;
    delete userObj.passwordResetTokenExpires;
    return userObj;
};

/**
* Check if password was changed after JWT token was issued
* @param {Number} iat - Token issued at timestamp
* @returns {Boolean} - True if password changed after token issue
*/
userSchema.methods.changedPasswordAfter = function (iat) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(
            this.passwordChangedAt.getTime() / 1000,
            10
        );
        return iat & lt; changedTimestamp;
    }
    return false;
};

/**
* Add address to user
* @param {Object} address - Address object
* @returns {Promise&lt;Object&gt;} - Updated user
*/
userSchema.methods.addAddress = async function (address) {
    const newAddress = {
        _id: new mongoose.Schema.Types.ObjectId(),
        ...address
    };
    this.addresses.push(newAddress);
    return this.save();
};

/**
* Update address
* @param {String} addressId - Address ID to update
* @param {Object} updates - Address updates
* @returns {Promise&lt;Object&gt;} - Updated user
*/
userSchema.methods.updateAddress = function (addressId, updates) {
    const address = this.addresses.id(addressId);
    if (!address) {
        throw new Error('Address not found');
    }
    Object.assign(address, updates);
    return this.save();
};

/**
* Delete address
* @param {String} addressId - Address ID to delete
* @returns {Promise&lt;Object&gt;} - Updated user
*/
userSchema.methods.deleteAddress = function (addressId) {
    this.addresses.id(addressId).remove();
    return this.save();
};

/**
* Get user with specific fields
* @param {String} fields - Fields to select
* @returns {Object} - User object
*/
userSchema.methods.selectFields = function (fields) {
    return this.select(fields);
};

// ==================== STATIC METHODS ====================
/**
* Find user by email and compare password
* @param {String} email - User email
* @param {String} password - User password
* @returns {Promise&lt;Object&gt;} - User object if credentials match
*/
userSchema.statics.findByCredentials = async function (email, password) {
    const user = await this.findOne({ email }).select('+password');
    if (!user) {
        throw new Error('Invalid email or password');
    }
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
        throw new Error('Invalid email or password');
    }
    return user;
};

/**
* Find users by role
* @param {String} role - User role
* @returns {Promise&lt;Array&gt;} - Array of users
*/
userSchema.statics.findByRole = async function (role) {
    return await this.find({ role, isActive: true });
};

/**
* Get total count of users by role
* @returns {Promise&lt;Object&gt;} - Count of users by role
*/
userSchema.statics.getStatsbyRole = async function () {
    return await this.aggregate([
        {
            $group: {
                _id: '$role',
                count: { $sum: 1 }
            }
        }
    ]);
};

// ==================== QUERY HELPERS ====================

// Exclude inactive users by default
userSchema.query.active = function () {
    return this.where({ isActive: true });
};

// Get only vendors
userSchema.query.vendors = function () {
    return this.where({ role: 'vendor', isActive: true });
};

// Get only customers
userSchema.query.customers = function () {
    return this.where({ role: 'customer', isActive: true });
};

// Get only admins
userSchema.query.admins = function () {
    return this.where({ role: 'admin', isActive: true });
};

userSchema.statics.USER_ROLES = USER_ROLES;
const User = mongoose.model('User', userSchema);
module.exports = User;