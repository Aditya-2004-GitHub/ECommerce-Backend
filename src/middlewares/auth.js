const jwt = require('jsonwebtoken');
const User = require('../models/user');

/**
* Verify JWT Token and attach user to request
*/
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        console.log('AUTH HEADER:', authHeader);

        // token extraction
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            // console.log('No token present');
            return res.status(401).json({ success: false, message: 'No token provided. Authorization denied.' });
        }

        // check secret
        if (!process.env.JWT_SECRET) {
            // console.error('JWT_SECRET missing from env');
            return res.status(500).json({ success: false, message: 'Server misconfiguration: JWT_SECRET missing' });
        }

        // verify token (explicit try so we log jwt errors separately)
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            // console.error('jwt.verify threw:', err.name, err.message);
            throw err; // let outer catch handle the JWT-specific responses
        }
        // console.log('Decoded token:', decoded);

        // verify payload contains id
        if (!decoded || (!decoded.id && !decoded.userId && !decoded._id)) {
            // console.warn('Token payload missing id claim');
            return res.status(401).json({ success: false, message: 'Invalid token payload.' });
        }

        // support different claim names
        const id = decoded.id || decoded.userId || decoded._id;

        // ensure DB connection and find user
        const user = await User.findById(id).lean().exec();
        // console.log('User from DB:', !!user, user ? user._id : null);

        if (!user || user.isActive === false) {
            return res.status(401).json({ success: false, message: 'User not found or account is inactive' });
        }

        // password changed check - safe guard if model method is not available on lean() result
        // if you want to run instance methods, remove .lean() above
        try {
            // if you used instance methods, fetch without lean and then call method
            if (typeof user.changePasswordAfter === 'function') {
                if (user.changePasswordAfter(decoded.iat)) {
                    return res.status(401).json({ success: false, message: 'Password changed recently. Please log in again.' });
                }
            } else {
                console.log('No changePasswordAfter instance method on user object (ok).');
            }
        } catch (err) {
            // If this check fails, log and require re-login
            console.error('Error running changePasswordAfter:', err);
            return res.status(401).json({ success: false, message: 'Authentication failed due to password validation.' });
        }

        // attach to request
        req.user = user;
        req.userId = id;
        return next();

    } catch (error) {
        // helpful full logging
        console.error('AUTH ERROR name:', error && error.name);
        console.error('AUTH ERROR message:', error && error.message);
        console.error('AUTH ERROR stack:', error && error.stack);

        if (error && error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token has expired.', code: 'TOKEN_EXPIRED' });
        }
        if (error && error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }

        return res.status(500).json({ success: false, message: 'Authentication failed' });
    }
};

/**
* Authorize user based on role
* Usage: authorize('admin', 'vendor')
*/
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. This resource requires one of these roles:` + roles.join(', ')
            });
        }
        next();
    }
}

/**
* Optional authentication - doesn't require token but attaches user if provided
*/
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id);
            if (user && user.isActive) {
                req.user = user;
                req.userId = decoded.id;
            }
        }
        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};



module.exports = { authenticate, authorize, optionalAuth };