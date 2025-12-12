const { createRazorpayOrder, verifyPaymentSignature, fetchPaymentDetails, refundPayment } = require('../config/razorpay');
const Order = require('../models/order');

// ==================== CREATE RAZORPAY ORDER ====================

/**
* Create Razorpay order for payment
* POST /api/payment/create-order
* Access: Authenticated
*/
const createPaymentOrder = async (req, res, next) => {
    try {
        const { orderId } = req.body;

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Check ownership
        if (order.user.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        // check if already paid
        if (order.paymentStatus === 'completed') {
            return res.status(400).json({
                success: false,
                message: "Order already paid"
            });
        }

        // Create razorpay order
        const razorpayOrder = await createRazorpayOrder(
            order.totalAmount,
            process.env.CURRENCY || 'INR',
            order.orderId
        );

        // update order with Razorpay order ID
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();

        return res.status(200).json({
            success: true,
            data: {
                orderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                keyId: process.env.RAZORPAY_KEY_ID
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== VERIFY PAYMENT ====================

/**
* Verify Razorpay payment signature
* POST /api/payment/verify
* Access: Authenticated
*/
const verifyPayment = async (req, res, next) => {
    try {
        const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        // Verify signature
        const isValid = verifyPaymentSignature(
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature
        )

        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Update order payment status
        order.paymentStatus = 'completed';
        order.razorpayPaymentId = razorpayPaymentId;
        order.razorpaySignature = razorpaySignature;
        order.paymentCompletedAt = new Date();
        order.orderStatus = 'confirmed'

        await order.save();

        return res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            data: { order }
        });

    } catch (error) {
        next(error);
    }
};

// ==================== PAYMENT FAILURE ====================
/**
* Handle payment failure
* POST /api/payment/failure
* Access: Authenticated
*/
const paymentFailure = async (req, res, next) => {
    try {
        const { orderId, error } = req.body;

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        order.paymentStatus = 'failed';
        order.adminNotes = `Payment failed: ${error?.description || 'Unknown error'}`;

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Payment failure recorded'
        });
    } catch (error) {
        next(error);
    }
};

// ==================== INITIATE REFUND (ADMIN) ====================

/**
* Initiate payment refund
* POST /api/payment/refund
* Access: Admin only
*/
const initiateRefund = async (req, res, next) => {
    try {
        const { orderId, amount } = req.body;

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (order.paymentStatus !== 'completed') {
            return res.status(400).json({
                success: false,
                message: "Cannot refund unpaid order"
            });
        }

        if (!order.razorpayPaymentId) {
            return res.status(400).json({
                success: false,
                message: 'No payment ID found'
            });
        }

        // Initiate refund
        const refund = await refundPayment(
            order.razorpayPaymentId,
            amount || order.totalAmount
        );

        // Update order
        order.paymentStatus = 'refunded';
        order.refundAmount = refund.amount / 100; //Convert paise to rupees
        order.refundedAt = new Date();

        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Refunded initiated successfullly',
            data: {
                refundId: refund.id,
                amount: refund.amount / 100
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== GET PAYMENT DETAILS ====================

/**
* Get payment details by payment ID
* GET /api/payment/:paymentId
* Access: Admin only
*/
const getPaymentDetails = async (req, res, next) => {
    try {
        const { paymentId } = req.params;

        const payment = await fetchPaymentDetails(paymentId);

        res.status(200).json({
            success: true,
            data: { payment }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { createPaymentOrder, verifyPayment, paymentFailure, initiateRefund, getPaymentDetails }