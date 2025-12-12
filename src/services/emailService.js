const nodemailer = require('nodemailer');
const path = require('path');

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

/**
 * send email with template
 */
const sendEmail = async ({
    to,
    subject,
    template,
    data = {}
}) => {
    try {
        let htmlContent = '';

        // Different email template
        switch (template) {
            case 'product-share':
                htmlContent = getProductShareTemplate(data);
                break;
            case 'product-shared-notification':
                htmlContent = getProductShareNotificationTemplate(data);
                break;
            case 'order-confirmation':
                htmlContent = getOrderConfirmationTemplate(data);
                break;
            case 'shipment-update':
                htmlContent = getShipmentUpdateTemplate(data);
                break;
            case 'vendor-product-approved':
                htmlContent = getVendorProductApprovedTemplate(data);
                break;
            case 'coupon-expiry-warning':
                htmlContent = getCouponExpiryTemplate(data);
                break;
            case 'new-vendor-alert':
                htmlContent = getNewVendorAlertTemplate(data);
                break;
            default:
                htmlContent = data.message || '';
        }

        const mailOptions = {
            from: process.env.SMTP_FROM || 'noreply@ecommerce.com',
            to: subject,
            html: htmlContent
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);

        return { success: true };
    } catch (error) {
        console.log('Email sending error: ', error);
        throw error
    }
};

// ==================== EMAIL TEMPLATES ====================

const getProductShareTemplate = (data) => {
    return `
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<div>
<h2>Hey ${data.recipientName || 'there'}! 👋</h2>
<p>${data.senderName} wants to share something amazing with you:</p>

<div>
<h3>${data.productName}</h3>
<img src="${data.productImage || ''}" alt="Product Image" style="max-width: 200px;">
<p><strong>Price: ₹${data.productPrice}</strong></p>
<p>${data.customMessage || ''}</p>
<a href="${data.productLink}">View Product</a>
</div>

<p>This product was shared with you by a friend on our platform.</p>
</div>
</body>
</html>
`;
};


const getProductSharedNotificationTemplate = (data) => {
    return `
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<div>
<h2>Great news! Your product was shared! 📢</h2>

<div>
<p><strong>${data.sharedBy}</strong> shared your product <strong>"${data.productName}"</strong> with someone.</p>

<div>
<p>💡 <strong>Tip:</strong> Track your share analytics to see engagement metrics.</p>
<a href="${data.referralLink}">View Analytics</a>
</div>

</div>
</div>
</body>
</html>
`;
};


const getOrderConfirmationTemplate = (data) => {
    return `
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<div>
<h2>Order Confirmed! ✅</h2>
<p>Thank you for your order, ${data.customerName}!</p>

<div>
<h3>Order Details</h3>
<p><strong>Order ID:</strong> ${data.orderId}</p>
<p><strong>Total Amount:</strong> ₹${data.orderTotal}</p>
<p><strong>Estimated Delivery:</strong> ${data.estimatedDelivery}</p>

<h3>Items</h3>
${data.items
            .map(
                (item) => `
<div>
<p><strong>${item.productName}</strong> x ${item.quantity}</p>
<p>₹${item.price} each</p>
</div>
`
            )
            .join('')}
</div>

</div>
</body>
</html>
`;
};


const getShipmentUpdateTemplate = (data) => {
    return `
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<div>
<h2>Shipment Update 📦</h2>

<div>
<p><strong>Status:</strong> ${data.status}</p>
<p><strong>Tracking Number:</strong> ${data.trackingNumber}</p>
<p><strong>Updated At:</strong> ${data.updatedAt}</p>

<div>
<h4>Current Location</h4>
<p>${data.location}</p>
<p>Expected delivery: ${data.estimatedDelivery}</p>
</div>

<a href="${data.trackingLink}">Track Shipment</a>
</div>

</div>
</body>
</html>
`;
};


const getVendorProductApprovedTemplate = (data) => {
    return `
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<div>
<h2>Product Approved! 🎉</h2>

<div>
<p>Congratulations! Your product "${data.productName}" has been approved!</p>
<p>It's now live and visible to all customers on our platform.</p>
<a href="${data.productLink}">View Product</a>
</div>

</div>
</body>
</html>
`;
};


const getCouponExpiryTemplate = (data) => {
    return `
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<div>
<h2>Coupon Expiring Soon! ⏰</h2>

<div>
<p>Don't miss out! Your coupon <strong>${data.couponCode}</strong> expires on <strong>${data.expiryDate}</strong>.</p>
<p>Use it now to get ${data.discount} off your order!</p>
<a href="${data.shopLink}">Shop Now</a>
</div>

</div>
</body>
</html>
`;
};


const getNewVendorAlertTemplate = (data) => {
    return `
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<div>
<h2>New Vendor Alert! 🆕</h2>

<div>
<p>A new vendor has joined our platform and submitted ${data.productsCount} products for approval.</p>
<p><strong>Store Name:</strong> ${data.vendorName}</p>
<p><strong>Category:</strong> ${data.category}</p>

<p>Please review and approve these products at your earliest convenience.</p>
<a href="${data.approvalLink}">Review Products</a>
</div>

</div>
</body>
</html>
`;
};


module.exports = {
    sendEmail,
    getProductShareTemplate,
    getProductSharedNotificationTemplate,
    getOrderConfirmationTemplate,
    getShipmentUpdateTemplate,
    getVendorProductApprovedTemplate,
    getCouponExpiryTemplate,
    getNewVendorAlertTemplate
};