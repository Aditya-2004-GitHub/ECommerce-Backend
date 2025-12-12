const dotenv = require('dotenv');
const app = require("./src/app");
const connectDB = require("./src/config/database");

//Connect to database
connectDB();

const PORT = process.env.PORT || 4800;

app.get("/", (req, res) => {
    res.send("Project Started");
});


const server = app.listen(PORT, () => {
    try {
        console.log(`Service is running on port ${PORT}\n http://localhost:${PORT}`);
    } catch (error) {
        console.log(`Error while connecting to the server: ${error.message}`);
    }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    console.error('Unhandled Rejection:', err.message);
    server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
    server.close(() => process.exit(1));
});

// Handle SIGTERM
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

