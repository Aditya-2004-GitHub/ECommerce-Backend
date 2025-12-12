const axios = require('axios');

class ShiprocketAPI {
    constructor() {
        this.baseURL = process.env.SHIPROCKET_API_URL;
        this.email = process.env.SHIPROCKET_EMAIL;
        this.password = process.env.SHIPROCKET_PASSWORD;
        this.token = null;
        this.tokenExpiry = null;
    }

    /**
    * Authenticate and get access token
    */
    async authenticate() {
        try {
            // Check if token is still valid
            if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
                return this.token;
            }

            const response = await axios.post(`${this.baseURL}/auth/login`, {
                email: this.email,
                password: this.password
            });

            this.token = response.data.token;
            // Toekn valid for 10 days, refresh after 9 days
            this.tokenExpiry = Date.now() + (9 * 24 * 60 * 60 * 1000);

            // console.log("Token: ", this.token);

            return this.token;
        } catch (error) {
            console.log('Shiprocket authentication failed: ', error.response?.data || error.message);
            throw new Error('Failed to authenticate with Shiprocket');
        }
    }

    /**
    * Make authenticated API request
    */
    async request(method, endpoint, data = null) {
        try {
            const token = await this.authenticate();

            console.log("Token 1: ", token)

            const config = {
                method,
                url: `${this.baseURL}${endpoint}`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            };

            // console.log("Config: ", config)
            // console.log("Data: ", data)

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            // console.log("Response: ", response)
            return response.data;
        } catch (error) {
            console.log('Shiprocket API error: ', error.response?.data || error.message);
            throw error;
        }
    }

    /**
    * Check pin code serviceability
    */
    async checkServiceability(pickupPincode, deliveryPincode, cod = 0, weight = 1) {
        try {
            const params = {
                pickup_postcode: pickupPincode,
                delivery_postcode: deliveryPincode,
                cod: cod, //0 = prepaid, 1 = COD
                weight: weight // in kg
            };

            // console.log("Pincode: ",params.pickup_postcode);
            // console.log("delivery code: ", params.delivery_postcode);

            const queryString = new URLSearchParams(params).toString();
            // console.log("Query: ", queryString)
            const result = await this.request('GET', `/courier/serviceability?${queryString}`);

            // console.log("Result: ", result)

            return result;
        } catch (error) {
            throw new Error('Failed to check serviceability: ' + error.message);
        }
    }

    /**
    * Calculate shipping rates
    */
    async calculateShippingRates(pickupPincode, deliveryPincode, weight, cod = 0, orderValue) {
        try {
            const params = {
                pickup_postcode: pickupPincode,
                delivery_postcode: deliveryPincode,
                cod: cod, //0 = prepaid, 1 = COD
                weight: weight, // in kg
                order_value: orderValue
            };

            const queryString = new URLSearchParams(params).toString();
            console.log('queryString:', queryString)

            const result = await this.request('GET', `/courier/serviceability?${queryString}`);

            if (result.data && result.data.available_courier_companies) {
                return result.data.available_courier_companies.map(courier => ({
                    courierId: courier.id,
                    courierName: courier.courier_name,
                    rate: courier.rate,
                    estimatedDeliveryDays: courier.estimated_delivery_days,
                    cod: courier.cod,
                    freightCharge: courier.freight_charge,
                    rating: courier.rating,
                    recommendedBy: courier.recommendation_by_shiprocket
                }));
            }

            return [];
        } catch (error) {
            throw new Error('Failed to calculate shipping rates: ' + error.message);
        }
    }

    /**
    * Create shipment order
    */
    async createOrder(orderData) {
        try {
            const result = await this.request('POST', `/orders/create/adhoc`, orderData);
            return result;
        } catch (error) {
            throw new Error('Failed to create shipment order: ' + error.message);
        }
    }

    /**
    * Generate AWB (Air Waybill)
    */
    async generateAWB(shipmentId, courierId) {
        try {
            const data = {
                shipment_id: shipmentId,
                courier_id: courierId
            };

            const result = await this.request('POST', 'courier/assign/awb', data);
            return result;
        } catch (error) {
            throw new Error('Failed to generate AWB: ' + error.message);
        }
    }

    /**
    * Schedule pickup
    */
    async shedulePickup(shipmentIds) {
        try {
            const data = {
                shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds]
            };

            const result = await this.request('POST', '/courier/generate/pickup', data);
            return result;
        } catch (error) {
            throw new Error('Failed to schedule pickup: ' + error.message);
        }
    }

    /**
    * Track shipment
    */
    async trackShipment(shipmentId) {
        try {
            const result = await this.request('GET', `/courier/track/shipment/${shipmentId}`);
            return result;
        } catch (error) {
            throw new Error('Failed to track shipment: ' + error.message);
        }
    }

    /**
    * Track by AWB
    */
    async trackByAWB(awbCode) {
        try {
            const result = await this.request('GET', `/courier/track/awb/${awbCode}`);
            return result;
        } catch (error) {
            throw new Error('Failed to track by AWB: ' + error.message);
        }
    }

    /**
    * Cancel shipment
    */
    async cancelShipment(orderIds) {
        try {
            const data = {
                ids: Array.isArray(orderIds) ? orderIds : [orderIds]
            };
            const result = await this.request('POST', '/orders/cancel', data);
            return result;
        } catch (error) {
            throw new Error('Failed to cancel shipment: ' + error.message);
        }
    }

    /**
    * Create return order
    */
    async createReturnOrder(returnData) {
        try {
            const result = await this.request('POST', 'orders/create/return', returnData);
            return result;
        } catch (error) {
            throw new Error('Failed to create return order: ' + error.message);
        }
    }

    /**
    * Generate shipping label
    */
    async generateLabel(shipmentIds) {
        try {
            const data = {
                shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds]
            };

            const result = await this.request('POST', '/courier/generate/label', data);
            return result;
        } catch (error) {
            throw new Error('Failed to generate shipping label: ' + error.message);
        }
    }

    /**
    * Get courier list
    */
    async getCourierList() {
        try {
            const result = await this.request('GET', '/courier');
            return result;
        } catch (error) {
            throw new Error('Failed to fetch courier list: ' + error.message);
        }
    }

    /**
    * Get pickup locations
    */
    async getPickupLocations() {
        try {
            const result = await this.request('GET', '/settings/company/pickup');
            return result;
        } catch (error) {
            throw new Error('Failed to get pickup locations');
        }
    }
}

// Export singleton instance
const shiprocket = new ShiprocketAPI();
module.exports = shiprocket;