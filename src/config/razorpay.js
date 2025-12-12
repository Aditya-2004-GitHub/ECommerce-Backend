const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

/**
 * Create Razorpay order
 */
const createRazorpayOrder = async (amount, currency = 'INR', receipt) => {
    try {
        const options = {
            amount: amount * 100, // Amount in paise
            currency: currency,
            receipt: receipt,
            payment_capture: 1 // Auto capture payment
        };

        const order = await razorpayInstance.orders.create(options);

        return order;
    } catch (error) {
        throw new Error(`Razorpay order creation failed: ${error.message}`);
    }
};

/**
* Verify Razorpay payment signature
*/
const verifyPaymentSignature = (orderId, paymentId, signature) => {
    const generated_signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

    return generated_signature === signature;
};

/**
* Fetch payment details
*/
const fetchPaymentDetails = async (paymentId) => {
    try {
        const payment = await razorpayInstance.payments.fetch(paymentId);
        return payment;
    } catch (error) {
        throw new Error(`Failed to fetch payment: ${error.message}`);
    }
};

/**
* Refund payment
*/
const refundPayment = async (paymentId, amount = null) => {
    try {
        const options = {};
        if (amount) {
            options.amount = amount * 100; // Partial refund
        }
        const refund = await razorpayInstance.payments.refund(paymentId, options);
        return refund;
    } catch (error) {
        throw new Error(`Refund failed: ${error.message}`);
    }
};

module.exports = {razorpayInstance, createRazorpayOrder, verifyPaymentSignature, fetchPaymentDetails, refundPayment}