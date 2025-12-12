const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: [1, 'Quantity must be at least 1'],
            default: 1
        },
        variantSku: {
            type: String, //If product has variants
            default: null
        },
        price: {
            type: Number,
            required: true
        },
        totalPrice: {
            type: Number,
            requitred: true
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }
);

const cartSchema = new mongoose.Schema(
    {
        // User or Session (for guest users)
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        sessionId: {
            type: String,
            default: null
        },

        // Cart Item
        items: [cartItemSchema],

        // Cart Summary
        totalItems: {
            type: Number,
            default: 0
        },
        subtotal: {
            type: Number,
            default: 0
        },

        // Expiry for guest (without login users)
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
    },
    { timestamps: true }
);

// ==================== INDEXES ====================
cartSchema.index({ user: 1 });
cartSchema.index({ sessionId: 1 });
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// ==================== MIDDLEWARES ====================

// Calculate totals before saving
cartSchema.pre('save', function (next) {
    this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
    this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
    next();
});

// ==================== INSTANCE METHODS ====================

/**
* Add item to cart
*/
cartSchema.methods.addItem = async function (product, quantity = 1, variantSku = null) {
    // Find if item already exists
    const existingItemIndex = this.items.findIndex(item => {
        if (variantSku) {
            return item.product.toString() === product._id.toString() && item.variantSku === variantSku;
        }
        return item.product.toString() === product._id.toString();
    });

    let price = product.price;

    // If variant, get variant price
    if (variantSku && product.hasVariants) {
        const variant = product.variants.find(v => v.sku === variantSku);
        if (variant) {
            price = variant.price;
        }
    }

    if (existingItemIndex > -1) {
        // Update existing item
        this.items[existingItemIndex].quantity += quantity;
        this.items[existingItemIndex].totalPrice =
            this.items[existingItemIndex].quantity * price;
    } else {
        // Add new item
        this.items.push({
            product: product._id,
            quantity,
            variantSku,
            price,
            totalPrice: price * quantity
        });
    }
    await this.save();
    return this;
};

/**
* Update item quantity
*/
cartSchema.methods.updateItemQuantity = async function (productId, quantity, variantSku = null) {
    const item = this.items.find(item => {
        if (variantSku) {
            return item.product.toString() === productId.toString() && item.variantSku === variantSku;
        }
        return item.product.toString() === productId.toString();
    });
    if (item) {
        item.quantity = quantity;
        item.totalPrice = item.price * quantity;
        await this.save();
    }
    return this;
};

/**
* Remove item from cart
*/
cartSchema.methods.removeItem = async function (productId, variantSku = null) {
    this.items = this.items.filter(item => {
        if (variantSku) {
            return !(item.product.toString() === productId.toString() && item.variantSku === variantSku);
        }
        return item.product.toString() !== productId.toString();
    });
    await this.save();
    return this;
};

/**
* Clear entire cart
*/
cartSchema.methods.clearCart = async function () {
    this.items = [];
    await this.save();
    return this;
};

/**
* Merge guest cart with user cart after login
*/
cartSchema.statics.mergeGuestCart = async function (sessionId, userId) {
    const guestCart = await this.findOne({ sessionId });
    const userCart = await this.findOne({ user: userId });
    if (!guestCart) return userCart;
    if (!userCart) {
        // Convert guest cart to user cart
        guestCart.user = userId;
        guestCart.sessionId = null;
        await guestCart.save();
        return guestCart;
    }
    // Merge items
    for (const guestItem of guestCart.items) {
        const existingItemIndex = userCart.items.findIndex(item =>
            item.product.toString() === guestItem.product.toString() && item.variantSku === guestItem.variantSku
        );
        if (existingItemIndex > -1) {
            userCart.items[existingItemIndex].quantity += guestItem.quantity;
            userCart.items[existingItemIndex].totalPrice = userCart.items[existingItemIndex].quantity * userCart.items[existingItemIndex].price;
        } else {
            userCart.items.push(guestItem);
        }
    }
    await userCart.save();
    await this.deleteOne({ _id: guestCart._id }); // Delete guest cart
    return userCart;
};

const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart