const express = require('express');
const router = express.Router();

const shippingController = require('../controllers/shippingController');
const { authenticate, authorize } = require('../middlewares/auth');

// ==================== PUBLIC ROUTES ====================

// Check pin code serviceability
router.get('/check-serviceability/:pincode', shippingController.checkServiceability);

// ==================== AUTHENTICATED ROUTES ====================

// Calculate shipping rates
router.post('/calculate-rates', authenticate, shippingController.calculateShippingRates);

// Track shipment
router.get('/track/:id', authenticate, shippingController.trackShipment);

// Create return shipment
router.post('/create-return', authenticate, authorize('customer'), shippingController.createReturnShipment);

// ==================== ADMIN/VENDOR ROUTES ====================

// Create shipment
router.post('/create-shipment', authenticate, authorize('admin', 'vendor'), shippingController.createShipment);

// Generate AWB
router.post('/generate-awb', authenticate, authorize('admin', 'vendor'), shippingController.generateAWB);

// Schedule pickup
router.post('/schedule-pickup', authenticate, authorize('admin', 'vendor'), shippingController.schedulePickup);

// Generate Label
router.post('/generate-label', authenticate, authorize('admin', 'vendor'), shippingController.generateLabel);

// Cancel Shipment
router.post('/cancel', authenticate, authorize('admin', 'vendor'), shippingController.cancelShipment);

// Get all shipments
router.get('/shipments', authenticate, authorize('admin', 'vendor'), shippingController.getShipments);

module.exports = router;