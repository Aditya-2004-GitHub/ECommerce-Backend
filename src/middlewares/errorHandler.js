const errorHandler = (err, req, res, next) => {
    // Set default error, status and message
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';

    // Handle mongoose cast error
    if(err.name === 'CastError'){
        statusCode = 400;
        message = `Resource not found. Invalid ${err.path}: ${err.value}`;
    }

    // Handle mongoose duplicate key error
    if(err.code === 11000){
        const field = Object.keys(err.keyValue)[0];
        statusCode = 400;
        message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
    }

    // Handle mongoose validation error
    if(err.name === 'ValidationError'){
        const errors = Object.values(err.errors).map(error => error.message);
        statusCode = 400;
        message = errors;
    }

    // Handle JWT errors
    if(err.name === "JsonWebTokenError"){
        statusCode = 401;
        message = 'Invalid token.';
    }

    if(err.name === 'TokenExpiredError'){
        statusCode = 401;
        message = 'Token expired';
    }

    // Log error for debugging
    console.log('Error: ', {
        status: statusCode,
        message: err.message,
        stack: err.stack
    });

    res.status(statusCode).json({
        success: false,
        statusCode,
        message: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

module.exports = errorHandler;