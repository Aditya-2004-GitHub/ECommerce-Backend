const crypto = require('crypto');
const Shipment = require('../models/shipment');
const Order = require('../models/order');

/**
* Handle Shiprocket webhook
* POST /api/webhooks/shiprocket
* Access: Public (with signature verification)
*/
const handleShiprocketWebhook = async (req, res, next) => {
    try {
        // Verify webhook signature
        const signature = req.headers['x-shiprocket-signature'];
        if (process.enc.SHIPROCKET_WEBHOOK_SECRET && signature) {
            const expectedSignature = crypto
                .createHmac('sha256', process.env.SHIPROCKET_WEBHOOK_SECRET)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (signature !== expectedSignature) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid webhook signature'
                });
            }
        }

        const webhookData = req.body;

        // Process different webhook events
        switch (webhookData.event) {
            case 'order_placed':
                await handleOrderPlaced(webhookData);
                break;

            case 'shipment_created':
                await handleShipmentCreated(webhookData);
                break;

            case 'shipment_picked':
                await handleShipmentPicked(webhookData);
                break;

            case 'shipment_in_transit':
                await handleShipmentInTransit(webhookData);
                break;

            case 'shipment_out_for_delivery':
                await handleShipmentOutForDelivery(webhookData);
                break;

            case 'shipment_delivered':
                await handleShipmentDelivered(webhookData);
                break;

            case 'shipment_cancelled':
                await handleShipmentCancelled(webhookData);
                break;

            case 'shipment_returned':
                await handleShipmentReturned(webhookData);
                break;

            case 'ndr_pending':
                await handleNDRPending(webhookData);
                break;

            default:
                console.log('Unknown webhook event:', webhookData.event);
        }
        // Always respond with 200 ok
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Webhook processing error:', error);
        // Still respond with 200 to prevent retries
        res.status(200).json({ success: true });
    }
}

// ==================== WEBHOOK EVENT HANDLERS ====================
async function handleOrderPlaced(data) {
    console.log('Order placed webhook:', data.order_id);
    // Additional processing if needed
}
async function handleShipmentCreated(data) {
    const shipment = await Shipment.findOne({
        shiprocketOrderId: data.order_id.toString()
    });
    if (shipment) {
        await shipment.addTrackingUpdate(
            'created',
            '',
            'Shipment created'
        );
    }
}

async function handleShipmentPicked(data) {
    const shipment = await Shipment.findOne({
        awbCode: data.awb
    }).populate('order');
    if (shipment) {
        shipment.pickupStatus = 'picked';
        await shipment.addTrackingUpdate(
            'picked',
            data.pickup_location || '',
            'Package picked up from warehouse'
        );
        // Update order
        if (shipment.order) {
            shipment.order.orderStatus = 'shipped';
            await shipment.order.save();
        }
    }
}

async function handleShipmentInTransit(data) {
    const shipment = await Shipment.findOne({ awbCode: data.awb });
    if (shipment) {
        await shipment.addTrackingUpdate(
            'in_transit',
            data.current_location || '',
            'Package in transit'
        );
    }
}

async function handleShipmentOutForDelivery(data) {
    const shipment = await Shipment.findOne({ awbCode: data.awb });
    if (shipment) {
        await shipment.addTrackingUpdate(
            'out_for_delivery',
            data.current_location || '',
            'Out for delivery'
        );
    }
}

async function handleShipmentDelivered(data) {
    const shipment = await Shipment.findOne({
        awbCode: data.awb
    }).populate('order');
    if (shipment) {
        await shipment.markDelivered(data.delivered_to || 'Customer');
        // Update order
        if (shipment.order) {
            await shipment.order.updateStatus('delivered');
        }
    }
}

async function handleShipmentCancelled(data) {
    const shipment = await Shipment.findOne({
        awbCode: data.awb
    }).populate('order');
    if (shipment) {
        await shipment.cancelShipment(data.reason || 'Cancelled by courier');
        // Update order
        if (shipment.order) {
            shipment.order.orderStatus = 'cancelled';
            await shipment.order.save();
        }
    }
}

async function handleShipmentReturned(data) {
    const shipment = await Shipment.findOne({
        awbCode: data.awb
    }).populate('order');
    if (shipment) {
        await shipment.addTrackingUpdate(
            'returned',
            '',
            'Package returned'
        );
        // Update order
        if (shipment.order) {
            shipment.order.returnStatus = 'completed';
            await shipment.order.save();
        }
    }
}

async function handleNDRPending(data) {
    // NDR = Non-Delivery Report (failed delivery attempt)
    const shipment = await Shipment.findOne({ awbCode: data.awb });
    if (shipment) {
        await shipment.addTrackingUpdate(
            'ndr_pending',
            data.current_location || '',
            `Delivery attempt failed: ${data.ndr_reason || 'Unknown reason'}`
        );
    }
    // TODO: Send notification to customer for action
}

module.exports = {
    handleShiprocketWebhook
};
