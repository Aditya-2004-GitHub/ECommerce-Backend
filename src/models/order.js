const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        productSnapshot: {
            name: String,
            image: String,
            sku: String
        },
        variantSku: String,
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number,
            required: true
        },
        totalPrice: {
            type: Number,
            required: true
        },
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        // Individual item status
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned'],
            default: 'pending'
        }
    }
);

const orderSchema = new mongoose.Schema(
    {
        orderId: {
            type: String,
            unique: true,
            required: true
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        items: [OrderItemSchema],
        subtotal: {
            type: Number,
            required: true
        },
        shippingCharge: {
            type: Number,
            default: 0
        },
        tax: {
            type: Number,
            default: 0
        },
        discount: {
            type: Number,
            default: 0
        },
        totalAmount: {
            type: Number,
            required: true
        },

        // Shipping address
        shippingAddress: {
            fullName: String,
            phone: String,
            street: String,
            city: String,
            state: String,
            postalCode: String,
            country: String
        },

        // Billing address
        billingAddress: {
            fullName: String,
            phone: String,
            street: String,
            city: String,
            state: String,
            postalCode: String,
            country: String
        },

        // Payment
        paymentMethod: {
            type: String,
            enum: ['razorpay', 'cod'],
            required: true
        },
        paymentStatus: {
            type: String,
            enum: ['pending', 'completed', 'failed', 'refunded'],
            default: 'pending'
        },
        razorpayOrderId: String,
        razorpayPaymentId: String,
        razorpaySignature: String,
        paymentCompletedAt: Date,

        // Order Status
        orderStatus: {
            type: String,
            enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
            default: 'pending'
        },

        // Tracking
        trackingNumber: String,
        courier: String,

        // Delivery
        estimatedDeliveryDate: Date,
        deliveredAt: Date,

        // Cancellation
        isCancelled: {
            type: Boolean,
            default: false
        },
        cancelledAt: Date,
        cancellationReason: String,

        // Return/refund
        isReturned: {
            type: Boolean,
            default: false
        },
        returnRequestedAt: Date,
        returnReason: String,
        returnStatus: {
            type: String,
            enum: ['requested', 'approved', 'rejected', 'completed'],
            default: null
        },
        refundAmount: Number,
        refundedAt: Date,

        // Notes
        customerNotes: String,
        adminNotes: String,

        // Status History
        statusHistory: [{
            status: String,
            updatedAt: {
                type: Date,
                default: Date.now
            },
            note: String
        }],

        // Shipping fields
        shipment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shipment'
        },
        shippingMethod: {
            type: String,
            enum: ['standard', 'express', 'same_day'],
            default: 'standard'
        },
        courierPartner: String,
        estimatedDeliveryDate: Date,

        // Coupon
        coupon: {
            couponId: mongoose.Schema.Types.ObjectId,
            code: String,
            discountType: {
                type: String,
                enum: ['percentage', 'fixed']
            },
            discountAmount: Number,
            freeShipping: Boolean,
            appliedAt: Date
        },
        discount: {
            type: Number,
            default: 0
        },

        // Price breakdown
        subtotal: Number,
        discount: {
            type: Number,
            default: 0
        },
        shippingCharge: Number,
        tax: Number,
        totalAmount: Number,
    },
    { timestamps: true }
);

// ==================== INDEXES ====================
orderSchema.index({ orderId: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ 'items.seller': 1 });
orderSchema.index({ createdAt: -1 });

// ==================== MIDDLEWARES ====================

// Generate order ID before saving
orderSchema.pre('validate', async function (next) {
    if (!this.orderId) {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        // Get count of orders today
        const startOfDay = new Date(date.setHours(0, 0, 0, 0));
        const count = await mongoose.model('Order').countDocuments({
            createdAt: { $gte: startOfDay }
        });

        const sequence = String(count + 1).padStart(4, '0');
        this.orderId = `${process.env.ORDER_ID_PREFIX || 'ORD'}${year}${month}${day}${sequence}`
    }
    next();
});

// Add status to history when status chenges
orderSchema.pre('save', function (next) {
    if (this.isModified('orderStatus')) {
        this.statusHistory.push({
            status: this.orderStatus,
            updatedAt: new Date()
        });
    }
    next();
});

// ==================== INSTANCE METHODS ====================

/**
* Cancel order
*/
orderSchema.methods.cancelOrder = async function (reason) {
    if (this.orderStatus === 'delivered') {
        throw new Error('Cannot cancel delivered order');
    }
    this.orderStatus = 'cancelled';
    this.isCancelled = true;
    this.cancelledAt = new Date();
    this.cancellationReason = reason;

    // Restore stock
    const Product = mongoose.model('Product');
    for (const item of this.items) {
        const product = await Product.findById(item.product);
        if (product) {
            await product.increaseStock(item.quantity, item.variantSku);
        }
    }

    await this.save();
    return this;
};

/**
* Update order status
*/
orderSchema.methods.updateStatus = async function (newStatus, note = '') {
    this.orderStatus = newStatus;
    if (newStatus === 'delivered') {
        this.deliveredAt = new Date();

        // Update product sales count
        const Product = mongoose.model('Product');
        for (const item of this.items) {
            await Product.findByIdAndUpdate(item.product, {
                $inc: { totalSold: item.quantity }
            });
        }
    }
    this.statusHistory.push({
        status: newStatus,
        updatedAt: new Date(),
        note
    });

    await this.save();
    return this;
};

/**
* Request return
*/
orderSchema.methods.requestReturn = async function (reason) {
    if (this.orderStatus !== 'delivered') {
        throw new Error('Can only return delivered orders');
    }
    const daysSinceDelivery = Math.floor(
        (Date.now() - this.deliveredAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Assuming 7-day return policy
    if (daysSinceDelivery > 7) {
        throw new Error('Return period has expired');
    }

    this.isReturned = true;
    this.returnRequestedAt = new Date();
    this.returnReason = reason;
    this.returnStatus = 'requested';

    await this.save();
    return this;
};

// Calculate Total
orderSchema.methods.calculateTotal = function () {
    let subtotal = 0;
    this.items.forEach(item => {
        subtotal += item.price * item.quantity;
    });

    this.subtotal = subtotal;
    let discount = 0;
    if (this.coupon && this.coupon.discountAmount) {
        discount = this.coupon.discountAmount;
    }

    let shippingCharge = this.shippingCharge || 0;
    if (this.coupon && this.coupon.freeShipping) {
        shippingCharge = 0;
    }

    // const tax = (subtotal - discount + shippingCharge) * 0.18;

    this.discount = discount;
    // this.tax = tax;
    this.totalAmount = subtotal - discount + shippingCharge;// + tax;
}

// ==================== STATIC METHODS ====================

/**
* Get user orders
*/
orderSchema.statics.getUserOrders = async function (userId, options = {}) {
    const {
        page = 1,
        limit = 10,
        status
    } = options;

    const query = { user: userId };
    if (status) query.orderStatus = status;

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
        this.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .populate('items.product', 'name images')
            .populate('user', 'firstName lastName email'),
        this.countDocuments(query)
    ]);

    return {
        orders,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit)
        }
    };
};

/**
* Get vendor orders
*/
orderSchema.statics.getVendorOrders = async function (vendorId, options = {}) {
    const {
        page = 1,
        limit = 10,
        status
    } = options;

    const query = { 'items.seller': vendorId };
    if (status) query['items.status'] = status;

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
        this.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .populate('items.product', 'name images')
            .populate('user', 'firstName lastName email'),
        this.countDocuments(query)
    ]);

    return {
        orders,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit)
        }
    };
};

/**
* Get order analytics
*/
orderSchema.statics.getAnalytics = async function (startDate, endDate) {
    const match = {
        createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    };

    const stats = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$totalAmount' },
                averageOrderValue: { $avg: '$totalAmount' },
                completedOrders: {
                    $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] }
                },
                cancelledOrders: {
                    $sum: { $cond: [{ $eq: ['$isCancelled', true] }, 1, 0] }
                }
            }
        }
    ]);

    return stats[0] || {
        totalOrders: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
        completedOrders: 0,
        cancelledOrders: 0
    };
};

module.exports = mongoose.models['Order'] ? mongoose.model('Order') : mongoose.model('Order', orderSchema);
