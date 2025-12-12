const express = require('express');
const router = express.Router();

const cartController = require('../controllers/cartController');
const { optionalAuth } = require('../middlewares/auth');
const { validateAddToCart } = require('../middlewares/productValidation')

// All cart routes support both guest (session) and authenticated users
router.use(optionalAuth);

// Get cart
router.get('/', cartController.getCart);

// Add item to cart
router.post('/add', validateAddToCart, cartController.addToCart);

// Update cart
router.put('/update', cartController.updateCartItem);

// Remove from cart
router.delete('/remove/:productId', cartController.removeFromCart);

// Clear cart
router.delete('/clear', cartController.clearCart);

// Merge cart
router.post('/merge', cartController.mergeCart);

module.exports = router;