const Order = require('../models/order');
const Cart = require('../models/cart');
const Product = require('../models/product');
const User = require('../models/user');
const { info } = require('console');

// ==================== CREATE ORDER ====================

/**
* Create new order
* POST /api/orders
* Access: Authenticated
*/
const createOrder = async (req, res, next) => {
    try {
        const { items, shippingAddress, billingAddress, paymentMethod, customerNotes } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Validate all products and calculate totals
        let subtotal = 0;
        let shippingCharge = 0;
        const orderItems = [];

        for (const item of items) {
            const product = await Product.findById(item.product);
            if (!product || !product.isActive || product.approvalStatus !== 'approved') {
                return res.status(400).json({
                    success: false,
                    message: `Product ${item.product} is not available`
                });
            }
            // Check stock
            let availableStock = product.stock;
            let price = product.price;

            if (product.hasVariants && item.variantSku) {
                const variant = product.variants.find(v => v.sku === item.variantSku);
                if (!variant || !variant.isAvailable) {
                    return res.status(400).json({
                        success: false,
                        message: `Variant ${item.variantSku} not available`
                    });
                }
                availableStock = variant.stock;
                price = variant.price;
            }

            if (availableStock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Only ${availableStock} units of ${product.name} available`
                });
            }

            // Calculate shipping
            if (!product.freeShipping) {
                shippingCharge += product.shippingCharge;
            }

            orderItems.push({
                product: product._id,
                productSnapshot: {
                    name: product.name,
                    image: product.getPrimaryImage()?.url,
                    sku: item.variantSku || 'N/A'
                },
                variantSku: item.variantSku,
                quantity: item.quantity,
                price: price,
                totalPrice: price * item.quantity,
                seller: product.seller
            });
            subtotal += price * item.quantity;
        }

        // Calculate tax (18% GST for example)
        // const tax = Math.round((subtotal + shippingCharge) * 0.18);
        const totalAmount = subtotal + shippingCharge;

        // Create order
        const order = await Order.create({
            user: req.userId,
            items: orderItems,
            subtotal,
            shippingCharge,
            // tax,
            totalAmount,
            shippingAddress,
            billingAddress: billingAddress || shippingAddress,
            paymentMethod,
            customerNotes,
            paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
            orderStatus: 'pending'
        });

        // Decrease stock for all products
        for (const item of orderItems) {
            const product = await Product.findById(item.product);
            await product.decreaseStock(item.quantity, item.variantSku);
        }

        // Clear user cart
        const cart = await Cart.findOne({ user: req.userId });
        if (cart) {
            await cart.clearCart();
        }

        // Populate Order
        await order.populate([
            { path: 'items.product', select: 'name images' },
            { path: 'user', select: 'firstName lastName email phone' }
        ]);

        return res.status(201).json({
            success: true,
            message: "Order created successfully",
            data: { order }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== GET USER ORDERS ====================

/**
* Get user's orders
* GET /api/orders
* Access: Authenticated
*/
const getUserOrders = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const result = await Order.getUserOrders(req.userId, {
            page: parseInt(page),
            limit: parseInt(limit),
            status
        });

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

// ==================== GET SINGLE ORDER ====================

/**
* Get order by ID
* GET /api/orders/:id
* Access: Authenticated (own order), Admin, Vendor (own products)
*/
const getOrder = async (req, res, next) => {
    try {
        const { id } = req.params;

        const order = await Order.findById(id)
            .populate('items.product', 'name images')
            .populate('items.seller', 'firstName lastName vendorInfo.storeName')
            .populate('user', 'firstName lastName email phone');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        // Authorization check
        const isOwner = order.user._id.toString() === req.userId;
        const isAdmin = req.user.role === 'admin';
        const isVendor = req.user.role === 'vendor' && order.items.some(item => item.seller.toString() === req.userId);

        if (!isOwner && !isAdmin && !isVendor) {
            return res.status(403).json({
                success: false,
                message: "Not authorized tp veiw this order"
            });
        }

        return res.status(200).json({
            success: true,
            data: { order }
        })
    } catch (error) {
        next(error);
    }
};

// ==================== CANCEL ORDER ====================

/**
* Cancel order
* PUT /api/orders/:id/cancel
* Access: Authenticated (own order)
*/
const cancelOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const order = await Order.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // check ownership
        if (order.user.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        // Check if cancellable
        if (['delivered', 'cancelled'].includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel ${order.orderStatus} order`
            });
        }

        await order.cancelOrder(reason);

        res.status(200).json({
            success: true,
            message: "Order cancelled successfully",
            data: { order }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== UPDATE ORDER STATUS (ADMIN/VENDOR) ====================

/**
* Update order status
* PUT /api/orders/:id/status
* Access: Admin, Vendor (own products)
*/
const updateOrderStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, trackingNumber, courier, note } = req.body;

        const validStatuses = ['confirmed', 'processing', 'shipped', 'delivered'];
        if(!validStatuses.includes(status)){
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const order = await Order.findById(id);

        if(!order){
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Update tracking info if provided
        if(trackingNumber) order.trackingNumber = trackingNumber;
        if(courier) order.courier = courier;

        await order.updateStatus(status, note);

        return res.status(200).json({
            success: true,
            message: 'Order status updated',
            data: { order }
        });
    } catch (error) {
        next(error);
    }
}

// ==================== REQUEST RETURN ====================

/**
* Request order return
* POST /api/orders/:id/return
* Access: Authenticated (own order)
*/
const requestReturn = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const order = await Order.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check ownership
        if (order.user.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        await order.requestReturn(reason);

        return res.status(200).json({
            success: true,
            message: "Return request submitted successfully",
            data: { order }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== GET VENDOR ORDERS ====================

/**
* Get vendor's orders
* GET /api/orders/vendor/my-orders
* Access: Vendor only
*/
const getVendorOrders = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const result = await Order.getVendorOrders(req.userId, {
            page: parseInt(page),
            limit: parseInt(limit),
            status
        });
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { createOrder, getUserOrders, getOrder, cancelOrder, updateOrderStatus, requestReturn, getVendorOrders }