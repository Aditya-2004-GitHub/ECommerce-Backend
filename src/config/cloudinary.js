// cloudinary.js
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create storage instance
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'ECom/users',
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
        resource_type: 'auto',
        transformation: [{ width: 500, height: 500, crop: 'limit', quality: 'auto' }],
    },
});

// Multer instance with limits and file filter
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WebP allowed.'));
        }
    },
});

module.exports = { cloudinary, upload };
