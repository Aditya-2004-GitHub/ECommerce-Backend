const mongoose = require('mongoose');
const { type } = require('os');

const couponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
            index: true
        },
        description: String,
        discountType: {
            type: String,
            enum: ['percentage', 'fixed'],
            required: true
        },
        discountValue: {
            type: Number,
            required: true,
            min: 0
            // for percentage: 5-100 (5% to 100%)
            // for fixed: 0-100000
        },
        maxDiscountAmount: {
            type: Number,
            // Max discount cap (e.g., max ₹1000 discount)
            // Only for percentage coupons
        },
        minOrderValue: {
            type: Number,
            default: 0
        },
        maxUsageLimit: {
            type: Number,
        },
        maxUsagePerUser: {
            type: Number,
            default: 1
        },
        validFrom: {
            type: Date,
            required: true,
            default: Date.now
        },
        validUntil: {
            type: Date,
            required: true
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        applicableCategories: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Category',
            }
        ],
        // If empty applies for all categories

        applicableProducts: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
            }
        ],
        // If empty applies for all products

        applicableUsers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            }
        ], // Can be use as VIP coupons

        usageCount: {
            type: Number,
            default: 0
        },
        userUsage: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true
                },
                usedCount: {
                    type: Number,
                    default: 0
                },
                lastUsedAt: Date,
                usageHistory: [
                    {
                        orderId: mongoose.Schema.Types.ObjectId,
                        discountAmount: Number,
                        usedAt: {
                            type: Date,
                            default: Date.now
                        },
                    }
                ]
            }
        ],
        freeShipping: {
            type: Boolean,
            default: false
        },
        combinableWithOtherCoupons: {
            type: Boolean,
            default: false
        },
        excludedProducts: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
            }
        ],
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        noted: String
    },
    { timestamps: true }
);

// ==================== INDEXES ====================
couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, validUntil: 1 });
couponSchema.index({ createdAt: -1 });

// ==================== PRE-SAVE VALIDATION ====================

couponSchema.pre('save', async function (next) {
    // Check if discount value is valid
    if (this.discountType === 'percentage') {
        if (this.discountType < 1 || this.discountValue > 100) {
            throw new Error('Percentage discount value must be between 1 and 100');
        }

        if (!this.maxDiscountAmount) {
            throw new Error('Max discount amount is required for percentage discount type');
        }
    } else if (this.discountType === 'fixed') {
        if (this.discountValue < 1) {
            throw new Error('Fixed discount value must be greater than 0');
        }
    }

    // Validate dates
    if (this.validUntil <= this.validFrom) {
        throw new Error('validUntil must be after validfrom');
    }

    if (this.validUntil <= new Date()) {
        throw new Error('Coupon already expired');
    }

    next();
});

// ==================== INSTANCE METHODS ====================

/**
* Check if coupon is valid for use
*/
couponSchema.methods.isValid = function () {
    const now = new Date();

    // Check if active
    if (!this.isActive) {
        return { valid: false, reason: 'Coupon is not active' };
    }

    // Check if expired
    if (now > this.validUntil) {
        return { valid: false, reason: 'Coupon has expired' };
    }

    // Check if not yet valid
    if (now < this.validFrom) {
        return { valid: false, reason: 'Coupon not yet valid' };
    }

    // Check global usage limit
    if (this.maxUsageLimit && this.usageCount >= this.maxUsageLimit) {
        return { valid: false, reason: 'Coupon usage limit reached' };
    }
    return { valid: true }
}

/**
* Check if user can use this coupon
*/
couponSchema.methods.canUserUse = function (userId) {
    const validation = this.isValid();
    if (!validation.valid) {
        return validation;
    }

    // Check if restricted to specific users
    if (this.applicableUsers.length > 0) {
        const userAllowed = this.applicableUsers.some(id => id.toString() === userId.toString());
        if (!userAllowed) {
            return {
                valid: false,
                reason: 'This coupon is not applicable for you'
            };
        }
    }

    // Check user usage limit
    const userUsageData = this.userUsage.find(u => u.user.toString() === userId.toString());

    if (userUsageData && userUsageData.usedCount >= this.maxUsagePerUser) {
        return {
            valid: false,
            reason: `You have already used this coupon ${this.maxUsagePerUser} time(s)`
        };
    }
    return { valid: true }
};

/**
* Calculate discount amount
*/
couponSchema.methods.calculateDiscount = function (cartTotal, cartItems = []) {
    // Check minimum order value
    if (cartTotal < this.minOrderValue) {
        return {
            valid: false,
            reason: `Minimum order value of ₹${this.minOrderValue} required`
        };
    }

    // Check if products are applicable
    if (this.applicableProducts.length > 0 || this.excludedProducts.length > 0) {
        const cartProductIds = cartItems.map(item => item.product.toString());
        // If specific products applicable, check if cart has them
        if (this.applicableProducts.length > 0) {
            const hasApplicableProduct = cartProductIds.some(id =>
                this.applicableProducts.some(p => p.toString() === id)
            );
            if (!hasApplicableProduct) {
                return {
                    valid: false,
                    reason: 'No applicable products in cart'
                };
            }
        }

        // Check if excluded products in cart
        if (this.excludedProducts.length > 0) {
            const hasExcludedProduct = cartProductIds.some(id =>
                this.excludedProducts.some(p => p.toString() === id)
            );
            if (hasExcludedProduct) {
                return {
                    valid: false,
                    reason: 'Some items in cart cannot use this coupon'
                };
            }
        }
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (this.discountType === 'percentage') {
        discountAmount = (cartTotal * this.discountValue) / 100;
        // Cap at maxDiscountAmount
        if (discountAmount > this.maxDiscountAmount) {
            discountAmount = this.maxDiscountAmount;
        }
    } else if (this.discountType === 'fixed') {
        discountAmount = this.discountValue;
        // Can't discount more than cart total
        if (discountAmount > cartTotal) {
            discountAmount = cartTotal;
        }
    }

    return {
        valid: true,
        discountAmount,
        discountType: this.discountType,
        freeShipping: this.freeShipping,
        originalTotal: cartTotal,
        finalTotal: cartTotal - discountAmount
    };
};

/**
* Apply coupon (track usage)
*/
couponSchema.methods.applyCoupon = async function (userId, orderId, discountAmount) {
    // Increment global usage
    this.usageCount += 1;

    // Track user usage
    let userUsageData = this.userUsage.find(u =>
        u.user.toString() === userId.toString()
    );

    if (!userUsageData) {
        userUsageData = {
            user: userId,
            usedCount: 0,
            usageHistory: []
        };
        this.userUsage.push(userUsageData);
    }

    userUsageData.usedCount += 1;
    userUsageData.lastUsedAt = new Date();
    userUsageData.usageHistory.push({
        orderId,
        discountAmount,
        usedAt: new Date()
    });

    await this.save();

    return {
        globalUsage: this.usageCount,
        userUsage: userUsageData.usedCount
    };
};

/**
* Get user usage details
*/
couponSchema.methods.getUserUsage = function (userId) {
    if (!Array.isArray(this.userUsage)) {
        return {
            usedCount: 0,
            remainingCount: this.maxUsagePerUser,
            lastUsedAt: null,
            history: []
        };
    }

    const userUsageData = this.userUsage.find(u =>
        u.user.toString() === userId.toString()
    );

    if (!userUsageData) {
        return {
            usedCount: 0,
            remainingCount: this.maxUsagePerUser,
            lastUsedAt: null,
            history: []
        };
    }

    return {
        usedCount: userUsageData.usedCount,
        remainingCount: this.maxUsagePerUser - userUsageData.usedCount,
        lastUsedAt: userUsageData.lastUsedAt,
        history: userUsageData.usageHistory
    };
};

/**
* Get coupon status
*/
couponSchema.methods.getStatus = function () {
    const now = new Date();

    if (!this.isActive) return 'inactive';
    if (now > this.validUntil) return 'expired';
    if (now < this.validFrom) return 'upcoming';
    if (this.maxUsageLimit && this.usageCount >= this.maxUsageLimit) return 'expired';

    return 'active';
};

// ==================== STATIC METHODS ====================

/**
* Find valid coupon by code
*/
couponSchema.statics.findValidCoupon = async function (code) {
    const coupon = await this.findOne({
        code: code.toUpperCase(),
        isActive: true,
        validUntil: { $gt: new Date() },
        validFrom: { $lte: new Date() }
    });

    return coupon;
};

/**
 *  Get active coupons
*/
couponSchema.statics.getActiveCoupons = async function () {
    const now = new Date();
    return await this.find({
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gt: now }
    })
        .select('code description discountType discountValue validUntil minOrderValue freeShipping')
        .sort({ validUntil: 1 });
};

/**
* Get expiring coupons (for admin notification)
*/
couponSchema.statics.getExpiringCoupons = async function (daysUntil = 7) {
    const now = new Date();
    const futureDate = new Date(now.getTime() + daysUntil * 24 * 60 * 60 * 1000);
    return await this.find({
        isActive: true,
        validUntil: {
            $gte: now,
            $lte: futureDate
        }
    })
        .select('code discountValue validUntil usageCount')
        .sort({ validUntil: 1 });
};

/**
* Get popular coupons
*/
couponSchema.statics.getPopularCoupons = async function (limit = 10) {
    return await this.find({ isActive: true })
        .sort({ usageCount: -1 })
        .limit(limit);
};

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;