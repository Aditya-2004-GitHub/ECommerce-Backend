const Cart = require('../models/cart');
const Product = require('../models/product');

// ==================== GET CART ====================

/**
* Get user's cart
* GET /api/cart
* Access: Public (session) or Authenticated
*/
const getCart = async (req, resizeBy, next) => {
    try {
        let cart;

        if(req.userId) {
            // logged if user
            cart = await Cart.findOne({ user: req.userId })
            .populate({
                path: 'items.product',
                select: 'name price mrp images stock isActive hasVariants variants'
            });
        } else {
            // Guest User
            const sessionId = req.sessionId || req.headers['x-session-id'];
            cart = await Cart.findOne({ sessionId })
            .populate({
                path: 'items.product',
                select: 'name price mrp images stock isActive hasVariants variants'
            });
        }

        if(!cart){
            return resizeBy.status(200).json({
                success: true,
                data: {
                    cart: {
                        items: [],
                        totalItems: 0,
                        subTotal: 0
                    }
                }
            });
        }

        return resizeBy.status(200).json({
            success: true,
            data: { cart }
        });
    } catch (error) {
        next(error);
    }
}

// ==================== ADD TO CART ====================

/**
* Add item to cart
* POST /api/cart/add
* Access: Public (session) or Authenticated
*/
const addToCart = async (req, res, next) => {
    try {
        const { productId, quantity = 1, variantSku } = req.body;

        const product = await Product.findById(productId);

        if(!product || !product.isActive || product.approvalStatus !== 'approved'){
            return res.status(404).json({
                success: false,
                message: "product not found or unavailable."
            });
        }

        // Check stock
        let availableStock = product.stock;
        if(product.hasVariants && variantSku){
            const variant = product.variants.find(v => v.sku === variantSku);
            if(!variant || !variant.isAvailable){
                return res.status(404).json({
                    success: false,
                    message: "Selected variant not available."
                });
            }
            availableStock = variant.stock;
        }

        if(availableStock < quantity){
            return res.status(400).json({
                success: false,
                message: `Only ${availableStock} items in stock.`
            });
        }

        // Find or create cart
        let cart;

        if(req.userId){
            cart = await Cart.findOne({ user: req.userId });
            if(!cart){
                cart = new Cart({ user: req.userId });
            }
        } else {
            const sessionId = req.sessionId || req.header['x-session-id'];
            cart = await Cart.findOne({ sessionId });
            if(!cart){
                cart = new Cart({ sessionId });
            }
        }

        // Add Item
        await cart.addItem(product, quantity, variantSku);

        // Populate for responce
        await cart.populate({
            path: 'items.product',
            select: 'name price mrp images stock'
        });

        return res.status(200).json({
            success: true,
            message: "Item added to cart.",
            data: { cart }
        });
    } catch (error) {
        next(error);
    }
}

// ==================== UPDATE CART ITEM ====================

/**
* Update cart item quantity
* PUT /api/cart/update
* Access: Public (session) or Authenticated
*/
const updateCartItem = async (req, res, next) => {
    try {
        const { productId, quantity, variantSku } = req.body;


        if(quantity < 1){
            return res.status(400).json({
                success: false,
                message: "Quantity must be at least 1"
            });
        }

        // Find cart
        let cart;
        if(req.userId){
            cart = await Cart.findOne({ user: req.userId });
        } else {
            const sessionId = req.sessionId || req.headers['x-session-id'];
            cart = await Cart.findOne({ sessionId });
        }

        if(!cart){
            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });
        }

        // Validate product and stock
        const product = await Product.findById(productId);
        if(!product) {
            return res.status(404).json({
                success: false,
                message: "product not found"
            });
        }

        let availableStock = product.stock;
        if(product.hasVariants && variantSku){
            const variant = product.variants.find(v => v.sku === variantSku);
            if (variant) availableStock = variant.stock;
        }

        if(availableStock < quantity){
            return res.status(400).json({
                success: false,
                message: `Only ${availableStock} items in stock.`
            });
        }

        // Update quantity
        await cart.updateItemQuantity(productId, quantity, variantSku);

        await cart.populate({
            path: 'items.product',
            select: 'name price mrp images stock'
        });

        return res.status(200).json({
            success: true,
            messsage: "Cart updated successfully",
            data: { cart }
        });
    } catch (error) {
        next(error);
    }
}

// ==================== REMOVE FROM CART ====================

/**
* Remove item from cart
* DELETE /api/cart/remove/:productId
* Access: Public (session) or Authenticated
*/
const removeFromCart = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const { variantSku } = req.query;

        // Find cart
        let cart;
        if(req.userId){
            cart = await Cart.findOne({ user: req.userId });
        }else {
            const sessionId = req.sessionId || req.headers['x-session-id'];
            cart = await Cart.findOne({ sessionId });
        }

        if(!cart){
            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });
        }

        await cart.removeItem(productId, variantSku);

        await cart.populate({
            path: 'items.product',
            select: 'name price mrp images stock'
        });

        return res.status(200).json({
            success: true,
            message: "Item remove from cart",
            data: { cart }
        });
    } catch (error) {
        next(error);
    }
}

// ==================== CLEAR CART ====================

/**
* Clear entire cart
* DELETE /api/cart/clear
* Access: Public (session) or Authenticated
*/
const clearCart = async (req, res, next) => {
    try {
        let cart;

        if(req.userId){
            cart = await Cart.findOne({ user: req.userId });
        } else{
            const sessionId = req.sessionId || req.headers['x-session-id'];
            cart = await Cart.findOne({ sessionId });
        }

        if(!cart){
            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });
        }

        await cart.clearCart();

        return res.status(200).json({
            success: true,
            message: "Cart cleared successfully"
        });
    } catch (error) {
        next(error);
    }
}

// ==================== MERGE CART (ON LOGIN) ====================

/**
* Merge guest cart with user cart after login
* POST /api/cart/merge
* Access: Authenticated
*/
const mergeCart = async (req, res, next) => {
    try {
        const { sessionId } = req.body;

        if(!sessionId){
            return res.status(400).json({
                success: false,
                message: 'Session ID required'
            });
        }

        const cart = await Cart.mergeGuestCart(sessionId, removeFromCart.userId);

        await cart.populate({
            path: 'items.product',
            select: 'name price mrp images stock'
        });

        return res.status(200).json({
            success: true,
            message: 'Cart merge successfully',
            data: { cart }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { getCart, addToCart, updateCartItem, removeFromCart, clearCart, mergeCart }