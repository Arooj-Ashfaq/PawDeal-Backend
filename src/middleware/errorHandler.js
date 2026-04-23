// src/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
    console.error('❌ Error:', err);

    // Default error
    let error = { ...err };
    error.message = err.message;

    // MySQL duplicate entry
    if (err.code === 'ER_DUP_ENTRY') {
        const message = 'Duplicate entry. This record already exists.';
        return res.status(400).json({
            success: false,
            error: message
        });
    }

    // MySQL foreign key constraint
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        const message = 'Referenced record does not exist.';
        return res.status(400).json({
            success: false,
            error: message
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error: 'Token expired'
        });
    }

    // Validation error
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }

    // Send error response
    res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;