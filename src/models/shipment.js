const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema(
    {
        // Reference to order
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true
        },

        // Shiprocket Ids
        shiprocketOrderId: {
            type: String,
            unique: true,
            sparse: true
        },
        shipmentId: String,
        awbCode: String,
        courierComapanyId: Number,
        courierName: String,

        // Pickup details
        pickupLocation: {
            name: String,
            address: String,
            city: String,
            state: String,
            pincode: String,
            country: String,
            phone: String,
            email: String
        },

        // Delivery details (from order)
        deliveryAddress: {
            name: String,
            address: String,
            city: String,
            state: String,
            pincode: String,
            country: String,
            phone: String,
            email: String
        },

        // Package details
        weight: {
            type: Number, // in kg
            required: true
        },
        dimensions: {
            length: Number, // in cm
            breadth: Number, // in cm
            height: Number // in cm
        },
        numberOfBoxes: {
            type: Number,
            default: 1
        },

        // Pricing
        shippingCharge: Number,
        codCharge: Number,
        estimatedDeliveryDays: Number,

        // Tracking
        currentStatus: {
            type: String,
            default: 'pending'
        },
        trackingHistory: [{
            status: String,
            location: String,
            date: Date,
            activity: String,
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],

        // Delivery
        expectedDeliveryDate: Date,
        actualDeliveryDate: Date,
        deliveredTo: String,

        // Labels & Documents
        labelUrl: String,
        manifestUrl: String,
        invoiceUrl: String,

        // Pickup
        pickupScheduledDate: Date,
        pickupStatus: {
            type: String,
            enum: ['pending', 'scheduled', 'picked', 'failed'],
            default: 'pending'
        },

        // Return (if applicable)
        isReturn: {
            type: Boolean,
            default: false
        },
        returnReason: String,

        // Status flags
        isActive: {
            type: Boolean,
            default: true
        },
        isCancelled: {
            type: Boolean,
            default: false
        },
        cancelledAt: Date,
        cancellationReason: String,

        // Metadata
        shiprocketResponse: mongoose.Schema.Types.Mixed,
        lastSyncedAt: Date
    },
    { timestamps: true }
);

// ==================== INDEXES ====================
shipmentSchema.index({ order: 1 });
shipmentSchema.index({ shiprocketOrderId: 1 });
shipmentSchema.index({ awbCode: 1 });
shipmentSchema.index({ currentStatus: 1 });
shipmentSchema.index({ createdAt: -1 });

// ==================== INSTANCE METHODS ====================
/**
* Add tracking update
*/
shipmentSchema.methods.addTrackingUpdate = function (status, location, activity) {
    this.trackingHistory.push({
        status,
        location,
        activity,
        date: new Date()
    });

    this.currentStatus = status;
    this.lastSyncedAt = new Date();

    return this.save();
};

/**
 * Mark as delivered
 */
shipmentSchema.methods.markDelivered = function (deliveredTo) {
    this.currentStatus = 'delivered';
    this.actualDeliveryDate = new Date();
    this.deliveredTo = deliveredTo;

    return this.save();
};

/**
 * Cancel Shipment
 */
shipmentSchema.methods.cancelShipment = function (reason) {
    this.isCancelled = true;
    this.cancelledAt = new Date();
    this.cancellationReason = reason;
    this.currentStatus = 'cancelled';

    return this.save();
};

// ==================== STATIC METHODS ====================

/**
 * Get active shipments
 */
shipmentSchema.statics.getActiveShipments = async function () {
    return await this.find({
        isActive: true,
        isCancelled: false,
        currentStatus: { $nin: ['delivered', 'cancelled'] }
    })
        .populate('order', 'orderId user')
        .sort({ createdAt: -1 });
};

/**
 * Get shipments by status
 */
shipmentSchema.statics.getByStatus = async function (status) {
    return await this.find({ currentStatus: status })
        .populate('order')
        .sort({ createdAt: -1 });
};

const Shipment = mongoose.model('Shipment', shipmentSchema);

module.exports = Shipment;