const mongoose = require('mongoose');
const { type } = require('os');

const pincodeServiceabilitySchema = new mongoose.Schema(
    {
        pincode: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        // Location details
        city: String,
        state: String,
        district: String,
        country: {
            type: String,
            default: 'India'
        },

        // Serviceability
        isServiceable: {
            type: Boolean,
            default: true
        },

        // COD availability
        codAvailable: {
            type: Boolean,
            default: true
        },

        // Prepaid availability
        prepaidAvailable: {
            type: Boolean,
            default: true
        },

        // Delivery details
        estimatedDeliveryDays: {
            min: Number,
            max: Number
        },

        // Available courier companies
        availableCouriers: [{
            courierId: Number,
            courierName: String,
            isActive: Boolean
        }],

        // Cache
        lastChecked: {
            type: Date,
            default: Date.now
        },
        cacheExpiry: {
            type: Date,
            default: () => new Date(Date.now() + 7*24*60*60*1000) //7 days
        }
    },
    { timestamps: true }
);

// ==================== INDEXES ====================
pincodeServiceabilitySchema.index({ pincode: 1 });
pincodeServiceabilitySchema.index({ isServiceable: 1 });
pincodeServiceabilitySchema.index({ cacheExpiry: 1 });

// ==================== STATIC METHODS ====================

/**
* Check if pincode is serviceable
*/
pincodeServiceabilitySchema.statics.isServiceable = async function(pincode) {
    const record = await this.findOne({ pincode, isServiceable: true});
    return !!record;
};

/**
* Check COD availability
*/
pincodeServiceabilitySchema.statics.isCODAvailable = async function(pincode) {
const record = await this.findOne({ pincode });
return record ? record.codAvailable : false;
};

/**
* Check COD availability
*/
pincodeServiceabilitySchema.statics.getServiceability = async function (pincode, shiprocketAPI) {
    // Check cache
    let record = await this.findOne({
        pincode,
        cacheExpiry: { $gt: new Date() }
    });

    if (record) {
        return record;
    }

    // Fetch from Shiprocket if not in cache or expired
    try {
        const defaultPickup = process.env.DEFAULT_PICKUP_PINCODE;

        const result = await shiprocketAPI.checkServiceability(
            defaultPickup,   // Pickup pincode
            pincode,         // Delivery pincode
            0,               // Weight
            1                // COD (1 = prepaid)
        );

        if (result.data) {
            // Update or create new record
            record = await this.findOneAndUpdate(
                { pincode },
                {
                    pincode,
                    city: result.data.city || "",
                    state: result.data.state || "",
                    isServiceable: result.data.available_courier_companies?.length > 0,
                    codAvailable: result.data.cod_available || false,
                    prepaidAvailable: true,
                    availableCouriers: result.data.available_courier_companies?.map(c => ({
                        courierId: c.id,
                        courierName: c.courier_name,
                        isActive: true
                    })) || [],
                    lastChecked: new Date(),
                    cacheExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days cache
                },
                { upsert: true, new: true }
            );
        }

        return record;

    } catch (error) {
        console.error("Error checking serviceability:", error);
        return null;
    }
};

const PincodeServiceability = mongoose.model('PincodeServiceability', pincodeServiceabilitySchema);
module.exports = PincodeServiceability;