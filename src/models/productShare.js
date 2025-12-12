const mongoose = require('mongoose');

const productShareSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
            index: true
        },
        sharedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        vendor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true
        },
        // Recipients
        recipients: [
            {
                email: String,
                phone: String,
                name: String,
                method: {
                    type: String,
                    enum: ['email', 'sms', 'whatsapp', 'link']
                },
                deliveryStatus: {
                    type: String,
                    enum: ['pending', 'sent', 'failed', 'bounced'],
                    default: 'pending'
                },
                deliveredAt: Date,
                failureReason: String
            }
        ],

        // Share details
        message: String,
        subject: String,
        shareMethod: {
            type: String,
            enum: ['email', 'sms', 'whatsapp', 'referral_link', 'social_media'],
            required: true
        },

        // Referral tracking
        referralCode: String,
        referralLink: String,

        // Analytics
        views: [
            {
                recipient: String,
                viewedAt: Date,
                duration: Number,
                device: String
            }
        ],
        clicks: {
            type: Number,
            default: 0
        },
        conversions: [
            {
                orderId: mongoose.Schema.Types.ObjectId,
                orderDate: Date,
                orderValue: Number
            }
        ],
        status: {
            type: String,
            enum: ['pending', 'sent', 'failed', 'completed'],
            default: 'pending'
        },

        // Metadata
        ipAddress: String,
        userAgent: String,
        tags: [String]
    },
    { timeStamps: true }
);

// Indexes
productShareSchema.index({ product: 1, createdAt: -1 });
productShareSchema.index({ sharedBy: 1 });
productShareSchema.index({ vendor: 1, createdAt: -1 });
productShareSchema.index({ referralCode: 1 });
productShareSchema.index({ 'recipients.email': 1 });

// Methods
productShareSchema.methods.markAsViewed = async function(viewerEmail, device){
    this.views.push({
        recipient: viewerEmail,
        viewedAt: new Date(),
        device
    });
    await this.save();
};

productShareSchema.methods.trackClick = async function(){
    this.clicks += 1;
    await this.save();
};

productShareSchema.methods.trackConversion = async function(orderId, orderValue) {
    this.conversions.push({
        orderId,
        orderDate: new Date(),
        orderValue
    });
    this.status = 'completed';
    await this.save();
};

const ProductShare = mongoose.model('ProductShare', productShareSchema);

module.exports = ProductShare;