const mongoose = require("mongoose");

const connectDB = async (req, res) => {
    try {
        const connection = await mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log(`Mongoose connected`))
        .catch(err => console.log(`Mongoose connection error: ${err}`));
    } catch (error) {
        console.log(`Database connection error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;