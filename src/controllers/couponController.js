const Coupon = require('../models/coupon');
const Order = require('../models/order');
const { validationResult } = require('express-validator');

// ==================== ADMIN: CREATE COUPON ====================

/**
* Create new coupon
* POST /api/coupons
* Access: Admin only
*/
const createCoupon = async (req, res, next) => {
    try {
        const {
            code,
            description,
            discountType,
            discountValue,
            maxDiscountAmount,
            minOrderValue,
            maxUsageLimit,
            maxUsagePerUser,
            validFrom,
            validUntil,
            applicableCategories,
            applicableProducts,
            applicableUsers,
            freeShipping,
            excludedProducts,
            combinableWithOtherCoupons
        } = req.body;

        // Check if coupon already exists
        const isCoupon = await Coupon.findOne({ code: code.toUpperCase() });

        if (isCoupon) {
            return res.status(400).json({
                success: false,
                message: "Coupon already exists"
            });
        }

        // Create Coupon
        const coupon = await Coupon.create({
            code: code.toUpperCase(),
            description,
            discountType,
            discountValue,
            maxDiscountAmount,
            minOrderValue: minOrderValue || 0,
            maxUsageLimit,
            maxUsagePerUser: maxUsagePerUser || 1,
            validFrom: new Date(validFrom),
            validUntil: new Date(validUntil),
            applicableCategories: applicableCategories || [],
            applicableProducts: applicableProducts || [],
            applicableUsers: applicableUsers || [],
            freeShipping: freeShipping || false,
            excludedProducts: excludedProducts || [],
            combinableWithOtherCoupons: combinableWithOtherCoupons || false,
            createdBy: req.userId
        });

        return res.status(201).json({
            success: true,
            message: "Coupon created successfully",
            data: { coupon }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== ADMIN: GET ALL COUPONS ====================

/**
* Get all coupons with filters
* GET /api/coupons
* Access: Admin only
*/
const getAllCoupons = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status, search, sortBy = '-createdAt' } = req.query;

        const skip = (page - 1) * limit;
        const query = {};

        // Filter by status
        if (status) {
            const now = new Date();
            switch (status) {
                case 'active':
                    query.isActive = true;
                    query.validFrom = { $lte: now };
                    query.validUntil = { $gt: now };
                    break;
                case 'inactive':
                    query.isActive = false;
                    break;
                case 'expired':
                    query.validUntil = { $lte: now };
                    break;
                case 'upcoming':
                    query.validFrom = { $gt: now };
                    break;
            }
        }

        // Search by code or description
        if (search) {
            query.$or = [
                { code: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const [coupons, total] = await Promise.all([
            Coupon.find(query)
                .skip(skip)
                .limit(parseInt(limit))
                .sort(sortBy)
                .populate('createdBy', 'firstName lastName email'),
            Coupon.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            data: { coupons },
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== ADMIN: GET SINGLE COUPON ====================

/**
* Get single coupon with usage details
* GET /api/coupons/:id
* Access: Admin only
*/
const getCoupon = async (req, res, next) => {
    try {
        const { id } = req.params;

        const coupon = await Coupon.findById(id)
            .populate('createdBy', 'firstName lastName email')
            .populate('applicableCategories', 'name slug')
            .populate('applicableProducts', 'name')
            .populate('applicableUsers', 'firstName lastName email')

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                ...coupon.toObject(),
                status: coupon.getStatus(),
                usageAnalysis: {
                    totalGlobalUsage: coupon.usageCount,
                    maxUsageLimit: coupon.maxUsageLimit,
                    usagePercentage: coupon.maxUsageLimit ? ((coupon.usageCount / coupon.maxUsageLimit) * 100).toFixed(2) : 'Unlimited'
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== ADMIN: UPDATE COUPON ====================

/**
* Update coupon
* PUT /api/coupons/:id
* Access: Admin only
*/
const updateCoupon = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            description,
            discountType,
            discountValue,
            maxDiscountAmount,
            minOrderValue,
            maxUsageLimit,
            maxUsagePerUser,
            validUntil,
            isActive,
            freeShipping,
            combinableWithOtherCoupons
        } = req.body;

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found"
            });
        }

        // Don't allow changing code
        if (req.body.code && req.body.code !== coupon.code) {
            return res.status(400).json({
                success: false,
                message: "Cannot change coupon code"
            });
        }

        // Update fields
        if (description !== undefined) coupon.description = description;
        if (discountType !== undefined) coupon.discountType = discountType;
        if (discountValue !== undefined) coupon.discountValue = discountValue;
        if (maxDiscountAmount !== undefined) coupon.maxDiscountAmount = maxDiscountAmount;
        if (minOrderValue !== undefined) coupon.minOrderValue = minOrderValue;
        if (maxUsageLimit !== undefined) coupon.maxUsageLimit = maxUsageLimit;
        if (maxUsagePerUser !== undefined) coupon.maxUsagePerUser = maxUsagePerUser;
        if (validUntil !== undefined) coupon.validUntil = new Date(validUntil);
        if (isActive !== undefined) coupon.isActive = isActive;
        if (freeShipping !== undefined) coupon.freeShipping = freeShipping;
        if (combinableWithOtherCoupons !== undefined) {
            coupon.combinableWithOtherCoupons = combinableWithOtherCoupons;
        }

        coupon.updatedBy = req.userId;

        await coupon.save();

        return res.status(200).json({
            success: true,
            message: "Coupon updated successfully",
            data: { coupon }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== ADMIN: DELETE/DEACTIVATE COUPON ====================

/**
* Deactivate coupon (soft delete)
* DELETE /api/coupons/:id
* Access: Admin only
*/
const deleteCoupon = async (req, res, next) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found"
            });
        }

        // Soft delete - just deactivate
        coupon.isActive = false;
        coupon.updatedBy = req.userId;
        await coupon.save();

        return res.status(200).json({
            success: true,
            message: 'Coupon deactivated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ==================== USER: GET AVAILABLE COUPONS ====================

/**
* Get available coupons for user
* GET /api/coupons/available/list
* Access: Authenticated users
*/
const getAvailableCoupons = async (req, res, next) => {
    try {
        const coupons = await Coupon.getActiveCoupons();

        const enhancedCoupons = coupons.map(coupon => {
            const userUsage = coupon.getUserUsage(req.userId);
            const validation = coupon.canUserUse(req.userId);

            return {
                _id: coupon._id,
                code: coupon.code,
                description: coupon.description,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                maxDiscountAmount: coupon.maxDiscountAmount,
                minOrderValue: coupon.minOrderValue,
                validUntil: coupon.validUntil,
                freeShipping: coupon.freeShipping,
                canUse: validation.valid,
                reason: validation.reason,
                usedCount: userUsage.usedCount,
                remainingCount: userUsage.remainingCount,
                lastUsedAt: userUsage.lastUsedAt
            };
        });

        return res.status(200).json({
            success: true,
            data: enhancedCoupons
        });
    } catch (error) {
        next(error);
    }
};

// ==================== USER: VALIDATE COUPON ====================

/**
* Validate coupon code
* POST /api/coupons/validate
* Access: Authenticated users
*/
const validateCoupon = async (req, res, next) => {
    try {
        const { code, cartTotal, cartItems } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code is required'
            });
        }

        if (cartTotal <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart total must be greater than 0'
            });
        }

        const coupon = await Coupon.findValidCoupon(code);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Invalid coupon code"
            });
        }

        const userValidation = coupon.canUserUse(req.userId);
        if (!userValidation) {
            return res.status(400).json({
                success: false,
                message: userValidation.reason
            });
        }

        // Calculate discount
        const discountResult = coupon.calculateDiscount(cartTotal, cartItems);

        if (!discountResult.valid) {
            return res.status(400).json({
                success: false,
                message: discountResult.reason
            });
        }

        res.status(200).json({
            success: true,
            message: 'Coupon is valid',
            data: {
                couponId: coupon._id,
                couponCode: coupon.code,
                discountType: discountResult.discountType,
                discountAmount: discountResult.discountAmount,
                freeShipping: discountResult.freeShipping,
                originalTotal: discountResult.originalTotal,
                finalTotal: discountResult.finalTotal,
                savings: discountResult.discountAmount
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== USER: APPLY COUPON TO ORDER ====================

/**
* Apply coupon to order
* POST /api/coupons/apply
* Access: Authenticated users
*/
const applyCoupon = async (req, res, next) => {
    try {
        const { couponCode, orderId } = req.body;

        if (!couponCode || !orderId) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code and order ID are required'
            });
        }

        // Get order
        const order = await Order.findById(orderId).populate('items.product');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify order belong to user
        if (order.user.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        // Get coupon
        const coupon = await Coupon.findValidCoupon(couponCode);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: "Invalid coupon code or expired coupon"
            });
        }

        // Validate user can use
        const userValidation = coupon.canUserUse(req.userId);
        if (!userValidation.valid) {
            return res.status(400).json({
                success: false,
                message: userValidation.reason
            });
        }

        // Calculate discount
        const cartItems = order.items.map(item => ({
            product: item.product._id,
            quantity: item.quantity
        }));

        const discountResult = coupon.calculateDiscount(order.subtotal, cartItems);

        if (!discountResult.valid) {
            return res.status(400).json({
                success: false,
                message: discountResult.reason
            });
        }

        // Apply coupon to order
        order.coupon = {
            couponId: coupon._id,
            code: coupon.code,
            discountType: coupon.discountType,
            discountAmount: discountResult.discountAmount,
            freeShipping: discountResult.freeShipping,
            appliedAt: new Date()
        };

        // Recalculate order totals
        let shippingCharge = order.shippingCharge;
        if (discountResult.freeShipping) {
            shippingCharge = 0;
        }

        // const tax = (order.subtotal - discountResult.discountAmount + shippingCharge) * 0.18;
        // order.tax = tax;
        order.totalAmount = order.subtotal - discountResult.discountAmount + shippingCharge;

        await order.save();

        // Track coupon usage
        await coupon.applyCoupon(req.userId, orderId, discountResult.discountAmount);

        return res.status(200).json({
            success: true,
            message: 'Coupon applied successfully',
            data: {
                coupon: order.coupon,
                subtotal: order.subtotal,
                discountAmount: discountResult.discountAmount,
                shippingCharge,
                // tax,
                totalAmount: order.totalAmount
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== USER: REMOVE COUPON FROM ORDER ====================

/**
* Remove coupon from order
* POST /api/coupons/remove/:orderId
* Access: Authenticated users
*/
const removeCoupon = async (req, res, next) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.user.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        if (!order.coupon) {
            return res.status(400).json({
                success: false,
                message: 'No coupon applied to this order'
            });
        }

        // Store discount info for reference
        const previousDiscount = order.coupon.discountAmount;

        // Remove coupon
        order.coupon = null;

        // Recalculate totals
        // const tax = (order.subtotal + order.shippingCharge) * 0.18;
        // order.tax = tax;
        order.totalAmount = order.subtotal + order.shippingCharge;// + tax;

        await order.save();

        res.status(200).json({
            success: true,
            message: 'Coupon removed successfully',
            data: {
                subtotal: order.subtotal,
                shippingCharge: order.shippingCharge,
                // tax,
                totalAmount: order.totalAmount,
                previousDiscount
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== ADMIN: GET COUPON USAGE ANALYTICS ====================

/**
* Get coupon usage analytics
* GET /api/coupons/:id/analytics
* Access: Admin only
*/
const getCouponAnalytics = async (req, res, next) => {
    try {
        const { id } = req.params;

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // Calculate total discount given
        let totalDiscountGiven = 0;
        let totalOrders = 0;

        coupon.userUsage.forEach(userData => {
            userData.usageHistory.forEach(history => {
                totalDiscountGiven += history.discountAmount;
                totalOrders += 1;
            });
        });

        // Average discount per use
        const avgDiscount =
            totalOrders > 0 ? totalDiscountGiven / totalOrders : 0;

        // Top users (TOP 5)
        const topUsers = coupon.userUsage
            .sort((a, b) => b.usedCount - a.usedCount)
            .slice(0, 5)
            .map(userData => ({
                userId: userData.user,
                usedCount: userData.usedCount,
                totalDiscountReceived: userData.usageHistory
                    .reduce((sum, h) => sum + h.discountAmount, 0),
                lastUsedAt: userData.lastUsedAt,
            }));

        res.status(200).json({
            success: true,
            data: {
                couponCode: coupon.code,
                totalGlobalUsage: coupon.usageCount,
                totalUniqueUsers: coupon.userUsage.length,
                totalOrdersWithCoupon: totalOrders,
                totalDiscountGiven,
                averageDiscountPerUse: avgDiscount.toFixed(2),
                maxUsageLimit: coupon.maxUsageLimit,
                usagePercentage: coupon.maxUsageLimit
                    ? ((coupon.usageCount / coupon.maxUsageLimit) * 100).toFixed(2)
                    : 'Unlimited',
                topUsers
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { createCoupon, getAllCoupons, getCoupon, updateCoupon, deleteCoupon, getAvailableCoupons, validateCoupon, applyCoupon, removeCoupon, getCouponAnalytics };