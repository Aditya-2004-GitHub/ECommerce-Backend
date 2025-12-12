const shiprocket = require('../config/shiprocket');
const Order = require('../models/order');
const Shipment = require('../models/shipment');
const PincodeServiceability = require('../models/pincodeServiceability');

// ==================== CHECK SERVICEABILITY ====================

/**
* Check pin code serviceability
* GET /api/shipping/check-serviceability/:pincode
* Access: Public
*/
const checkServiceability = async (req, res, next) => {
    try {
        const { pincode } = req.params;

        if (!pincode || pincode.length !== 6) {
            return res.status(400).json({
                success: false,
                message: 'Invalidd pincode format'
            });
        }

        const serviceability = await PincodeServiceability.getServiceability(pincode, shiprocket);

        if (!serviceability) {
            return res.status(404).json({
                success: false,
                message: 'Unable to check serviceability'
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                pincode: serviceability.pincode,
                city: serviceability.city,
                state: serviceability.state,
                isServiceable: serviceability.isServiceable,
                codAvailable: serviceability.codAvailable,
                estimatedDeliveryDays: serviceability.estimatedDeliveryDays
            }
        });
    } catch (error) {
        next(error);
    }
};

// const checkServiceability = async (req, res, next) => {
//     try {
//         const { pincode } = req.params;

//         // Validate pincode format
//         if (!pincode || !/^\d{6}$/.test(pincode)) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Invalid pincode format. Please provide a 6-digit pincode.'
//             });
//         }

//         console.log(`📦 Checking serviceability for pincode: ${pincode}`);

//         // Call Shiprocket API
//         const result = await shiprocket.checkServiceability(pincode, pincode, 0, 1);

//         if (!result || !result.data) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Serviceability data not found'
//             });
//         }

//         // Parse response
//         const serviceability = {
//             pincode: pincode,
//             isServiceable: result.data.serviceability_message === 'Serviceable' || result.data.serviceability === true,
//             codAvailable: result.data.cod_available || false,
//             estimatedDeliveryDays: result.data.estimated_delivery_days || 'N/A',
//             couriers: result.data.available_courier_companies || []
//         };

//         return res.status(200).json({
//             success: true,
//             data: serviceability
//         });

//     } catch (error) {
//         console.error('❌ Controller error:', error.message);
        
//         return res.status(500).json({
//             success: false,
//             message: error.message || 'Failed to check serviceability'
//         });
//     }
// };

// ==================== CALCULATE SHIPPING RATES ====================

/**
* Calculate shipping rates
* POST /api/shipping/calculate-rates
* Access: Authenticated
*/
const calculateShippingRates = async (req, res, next) => {
    try {
        const { deliveryPincode, weight, cod, orderValue } = req.body;

        const pickupPincode = process.env.DEFAULT_PICKUP_PINCODE;

        const rates = await shiprocket.calculateShippingRates(
            pickupPincode,
            deliveryPincode,
            weight,
            cod ? 1 : 0,
            orderValue || 0
        );

        // Sort by rate (cheapest first)
        const sortedRates = rates.sort((a, b) => a.rate - b.rate);

        // Find recomended courier
        const recommended = sortedRates.find(r => r.recommendedBy === 1 || sortedRates[0]);

        return res.status(200).json({
            success: true,
            data: {
                rates: sortedRates,
                recommended: recommended,
                cheapest: sortedRates[0]
            }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== CREATE SHIPMENT ====================

/**
* Create shipment for order
* POST /api/shipping/create-shipment
* Access: Admin, Vendor
*/
const createShipment = async (req, res, next) => {
    try {
        const { orderId, courierId, weight, dimensions } = req.body;

        // Get order
        const order = await Order.findById(orderId)
            .populate('user', 'firstName lastName email phone')
            .populate('items.product', 'name');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if shipment already exists
        const existingShipment = await Shipment.findOne({ order: orderId });

        if (existingShipment) {
            return res.status(400).json({
                success: false,
                message: 'Shipment already exists for this order'
            });
        }

        // Prepare shipment data
        const orderDate = {
            order_id: order.orderId,
            order_date: order.createdAt.toISOString().split('T')[0],

            // Pickup details
            pickup_location: process.enc.DEFAULT_PICKUP_ADDRESS || 'Primary',

            // Billing details
            billing_customer_name: order.user.firstName + ' ' + order.user.lastName,
            billing_last_name: order.user.lastName,
            billing_address: order.billingAddress.street,
            billing_city: order.billingAddress.city,
            billing_pincode: order.billingAddress.postalCode,
            billing_state: order.billingAddress.state,
            billing_country: order.billingAddress.country,
            billing_email: order.user.email,
            billing_phone: order.billingAddress.phone,

            // Shipping details
            shippinig_is_billing: false,
            shipping_customer_name: order.shippingAddress.fullName,
            shipping_last_name: '',
            shipping_address: order.shippingAddress.street,
            shipping_city: order.shippingAddress.city,
            shipping_pincode: order.shippingAddress.postalCode,
            shipping_country: order.shippingAddress.country,
            shipping_state: order.shippingAddress.state,
            shipping_email: order.user.email,
            shipping_phone: order.shippingAddress.phone,

            // Order items
            order_items: order.items.map(item => ({
                name: item.productSnapshot.name,
                sku: item.productSnapshot.sku || 'DEFAULT',
                units: item.quantity,
                selling_price: item.price,
                discount: 0,
                tax: 0,
                hsn: ''
            })),

            // Payment
            payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
            shipping_charges: order.shippingCharge || 0,
            giftwrap_charges: 0,
            transaction_charges: 0,
            total_discound: order.discount || 0,
            sub_total: order.subtotal,
            length: dimensions?.length || 10,
            breadth: dimensions?.breadth || 10,
            height: dimensions?.height || 10,
            weight: weight
        };

        // Create order in shiprocket
        const shiprocketResponse = await shiprocket.createOrder(orderData);

        if (!shiprocketResponse.order_id) {
            throw new Error('Failed to create shipment order');
        }

        // Create shipment record
        const shipment = await Shipment.create({
            order: orderId,
            shiprocketOrderId: shiprocketResponse.order_id.toString(),
            shipmentId: shiprocketResponse.shipment_id?.toString(),
            pickupLocation: {
                address: process.env.DEFAULT_PICKUP_ADDRESS,
                city: process.env.DEFAULT_PICKUP_CITY,
                state: process.env.DEFAULT_PICKUP_STATE,
                pincode: process.env.DEFAULT_PICKUP_PINCODE,
                country: process.env.DEFAULT_PICKUP_COUNTRY
            },
            deliveryAddress: {
                name: order.shippingAddress.fullName,
                address: order.shippingAddress.street,
                city: order.shippingAddress.city,
                state: order.shippingAddress.state,
                pincode: order.shippingAddress.postalCode,
                country: order.shippingAddress.country,
                phone: order.shippingAddress.phone,
                email: order.user.email
            },
            weight: weight,
            dimensions: dimensions,
            shiprocketResponse: shiprocketResponse
        });

        // Generate AWB if courier selected
        if (courierId && shiprocketResponse.shipment_id) {
            try {
                const awbResponse = await shiprocket.generateAWB(
                    shiprocketResponse.shipment_id,
                    courierId
                );

                if (awbResponse.awb_assign_status === 1) {
                    shipment.awbCode = awbResponse.response.data.awb_code;
                    shipment.courierComapanyId = awbResponse.response.data.courier_company_id;
                    shipment.courierName = awbResponse.response.data.courier_name;
                    await shipment.save();
                }
            } catch (error) {
                console.log('AWB generation failed:', error);
            }
        }

        // Update order
        order.trackingNumber = shipment.awbCode;
        order.orderStatus = 'processing';
        await order.save();

        return res.status(201).json({
            success: true,
            message: 'Shipment created successfully',
            data: { shipment }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== GENERATE AWB ====================

/**
* Generate AWB for shipment
* POST /api/shipping/generate-awb
* Access: Admin, Vendor
*/
const generateAWB = async (req, res, next) => {
    try {
        const { shipmentId, courierId } = req.body;

        const shipment = await Shipment.findById(shipmentId);
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        if (shipment.awbCode) {
            return res.status(400).json({
                success: false,
                message: 'AWB already generated for this shipment'
            });
        }

        const awbResponse = await shiprocket.generateAWB(
            shipment.shipmentId,
            courierId
        );

        if (awbResponse.awb_assign_status === 1) {
            shipment.awbCode = awbResponse.response.data.awb_code;
            shipment.courierComapanyId = awbResponse.response.data.courier_company_id;
            shipment.courierName = awbResponse.response.data.courier_name;
            await shipment.save();

            return res.status(200).json({
                success: true,
                message: "AWB generated successfully",
                data: {
                    awbCode: shipment.awbCode,
                    courierName: shipment.courierName
                }
            });
        } else {
            throw new Error('Failed to generate AWB');
        }
    } catch (error) {
        next(error);
    }
};

// ==================== SCHEDULE PICKUP ====================

/**
* Schedule pickup for shipment
* POST /api/shipping/schedule-pickup
* Access: Admin, Vendor
*/
const schedulePickup = async (req, res, next) => {
    try {
        const { shipmentId } = req.body;

        const shipment = await Shipment.findById(shipmentId);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        if (!shipment.awbCode) {
            return res.status(400).json({
                success: false,
                message: 'Generate AWB before scheduling pickup'
            });
        }

        const pickupResponse = await shiprocket.schedulePickup(shipment.shipmentId);

        if (pickupResponse.pickup_scheduled_date === 1) {
            shipment.pickupScheduledDate = new Date(pickupResponse.pickup_scheduled_date);
            shipment.pickupStatus = 'scheduled';
            await shipment.save();

            return res.status(200).json({
                success: true,
                message: 'Pickup scheduled successfully',
                data: {
                    pickupDate: pickupResponse.pickup_scheduled_date,
                    pickupTokenNumber: pickupResponse.pickup_token_number
                }
            });
        } else {
            throw new Error('Failed to schedule pickup');
        }
    } catch (error) {
        next(error);
    }
};

// ==================== TRACK SHIPMENT ====================

/**
* Track shipment
* GET /api/shipping/track/:id
* Access: Authenticated (own orders), Admin, Vendor
*/
const trackShipment = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Find shipment by ID or AWB
        let shipment = await Shipment.findById(id).populate('order', 'orderId user');
        if (!shipment) {
            shipment = await Shipment.findOne({ awbCode: id }).populate('order', 'orderId user');
        }

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        // Authorization check
        if (req.user.role === 'customer') {
            if (shipment.order.user.toString() !== req.userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized'
                });
            }
        }

        // Fetch latest tracking info from Shiprocket
        try {
            const trackingInfo = await shiprocket.trackByAWB(shipment.awbCode);

            if (trackingInfo.tracking_data) {
                const latestStatus = trackingData.tracking_data.shipment_track[0];

                // Update shipment status
                await shipment.addTrackingUpdate(
                    latestStatus.current_status,
                    latestStatus.current_location || '',
                    latestStatus.activity || ''
                );
            }
        } catch (error) {
            console.log('Tracking update failed: ', error);
        }

        return res.status(200).json({
            success: true,
            data: {
                shipment: {
                    awbCode: shipment.awbCode,
                    courierName: shipment.courierName,
                    currentStatus: shipment.currentStatus,
                    expectedDeliveryDate: shipment.expectedDeliveryDate,
                    trackingHistory: shipment.trackingHistory
                }
            }
        });
    } catch (error) {
        nect(error);
    }
};

// ==================== GENERATE LABEL ====================

/**
 * Generate shipping label
 * GET /api/shipping/generate-label
 * Access: Admin, Vendor
 */
const generateLabel = async (req, res, next) => {
    try {
        const { shipmentId } = req.body;

        const shipment = await Shipment.findById(shipmentId);
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        const labelResponse = await shiprocket.generateLabel(shipment.shipmentId);

        if (labelResponse.label_url) {
            shipmentlabelUrl = labelResponse.label_url;
            await shipment.save();

            return res.status(200).json({
                success: true,
                message: 'Shipping label generated successfully',
                data: {
                    labelUrl: labelResponse.label_url
                }
            });
        } else {
            throw new Error('Failed to generate shipping label');
        }
    } catch (error) {
        next(error);
    }
};

// ==================== CANCEL SHIPMENT ====================

/**
* Cancel shipment
* POST /api/shipping/cancel
* Access: Admin, Vendor
*/
const cancelShipment = async (req, res, next) => {
    try {
        const { shipmentId, reason } = req.body;
        const shipment = await Shipment.findById(shipmentId).populate('order');

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        if (shipment.currentStatus === 'delivered') {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel delivered shipment'
            });
        }

        // Cancel in shiprocket
        await shiprocket.cancelShipment(shipment.shiprocketOrderId);

        // Update shipment
        await Shipment.cancelShipment(reason);

        // Update order
        const order = shipment.order;
        order.orderStatus = 'cancelled';
        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Shipment cancelled successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ==================== CREATE RETURN SHIPMENT ====================

/**
* Create return shipment
* POST /api/shipping/create-return
* Access: Authenticated
*/
const createReturnShipment = async (req, res, next) => {
    try {
        const { orderId, returnReason } = req.body;

        const order = await Order.findById(orderId).populate('user', 'firstName lastName email phone');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // verify ownership
        if (order.user._id.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        // Check if already delivered
        if (order.orderStatus !== 'delivered') {
            return res.status(400).json({
                success: false,
                message: 'Return can be initiated only for delivered orders'
            });
        }

        // Get original shipment
        const originalShipment = await Shipment.findOne({ order: orderId });

        // Prepare return order data
        const returnData = {
            order_id: order.orderId,
            order_date: order.createdAt.toISOString().split('T')[0],

            // Pickup from customer (now becomes pickup)
            pickup_customer_name: order.shippingAddress.fullName,
            pickup_last_name: '',
            pickup_address: order.shippingAddress.street,
            pickup_city: order.shippingAddress.city,
            pickup_state: order.shippingAddress.state,
            pickup_country: order.shippingAddress.country,
            pickup_pincode: order.shippingAddress.postalCode,
            pickup_email: order.user.email,
            pickup_phone: order.shippingAddress.phone,

            // Deliver to warehouse (now becomes delivery)
            shipping_customer_name: 'Warehouse',
            shipping_last_name: '',
            shipping_address: process.env.DEFAULT_PICKUP_ADDRESS,
            shipping_city: process.env.DEFAULT_PICKUP_CITY,
            shipping_state: process.env.DEFAULT_PICKUP_STATE,
            shipping_country: process.env.DEFAULT_PICKUP_COUNTRY,
            shipping_pincode: process.env.DEFAULT_PICKUP_PINCODE,
            shipping_email: process.env.SHIPROCKET_EMAIL,
            shipping_phone: '9561700261',

            // Order items
            order_items: order.items.map(item => ({
                name: item.productSnapshot.name,
                sku: item.productSnapshot.sku || 'DEFAULT',
                units: item.quantity,
                selling_price: item.price,
                discount: 0,
                tax: 0
            })),

            payment_method: 'Prepaid',
            sub_total: order.subtotal,
            length: originalShipment?.dimensions?.length || 10,
            breadth: originalShipment?.dimensions?.breadth || 10,
            height: originalShipment?.dimensions?.height || 10,
            weight: originalShipment?.weight || 1
        };

        // Create return order in Shiprocket
        const returnResponse = await shiprocket.createReturnOrder(returnData);

        // Create return shipment record
        const returnShipment = await Shipment.create({
            order: orderId,
            shipmentOrderId: returnResponse.order_id.toString(),
            shipmentId: returnResponse.shipment_id?.toString(),
            isReturn: true,
            returnReason,
            weight: originalShipment?.weight || 1,
            pickupLocation: {
                name: order.shippingAddress.fullName,
                address: order.shippingAddress.street,
                city: order.shippingAddress.city,
                state: order.shippingAddress.state,
                pincode: order.shippingAddress.postalCode,
                country: order.shippingAddress.country,
                phone: order.shippingAddress.phone
            },
            deliveryAddress: {
                name: 'Warehouse',
                address: process.env.DEFAULT_PICKUP_ADDRESS,
                city: process.env.DEFAULT_PICKUP_CITY,
                state: process.env.DEFAULT_PICKUP_STATE,
                pincode: process.env.DEFAULT_PICKUP_PINCODE,
                country: process.env.DEFAULT_PICKUP_COUNTRY
            }
        });

        // Update order
        order.isReturned = true,
            order.returnRequestedAt = new Date();
        order.returnStatus = 'requested';
        await order.save();

        return res.status(201).json({
            success: true,
            message: 'Return shipment created successfully',
            data: { returnShipment }
        });
    } catch (error) {
        next(error);
    }
};

// ==================== GET SHIPMENTS ====================

/**
* Get all shipments
* GET /api/shipping/shipments
* Access: Admin, Vendor
*/
const getShipments = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status } = req.query;

        const query = {};
        if (status) query.currentStatus = status;

        const skip = (page - 1) * limit;

        const [shipments, total] = await Promise.all([
            Shipment.find(query)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('order', 'orderId user')
                .sort({ createdAt: -1 }),
            Shipment.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: {
                shipments,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { checkServiceability, calculateShippingRates, createShipment, generateAWB, schedulePickup, trackShipment, generateLabel, cancelShipment, createReturnShipment, getShipments };