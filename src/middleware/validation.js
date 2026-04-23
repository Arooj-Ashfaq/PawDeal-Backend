const { body, param, query, validationResult } = require('express-validator');

// Validation rules
const validate = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) {
            return next();
        }

        res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    };
};

// Auth validation rules
const authValidation = {
    register: [
        body('email').isEmail().withMessage('Valid email required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
        body('first_name').notEmpty().withMessage('First name required'),
        body('last_name').notEmpty().withMessage('Last name required'),
        body('phone').optional().isMobilePhone().withMessage('Valid phone number required')
    ],
    login: [
        body('email').isEmail().withMessage('Valid email required'),
        body('password').notEmpty().withMessage('Password required')
    ],
    forgotPassword: [
        body('email').isEmail().withMessage('Valid email required')
    ],
    resetPassword: [
        body('token').notEmpty().withMessage('Token required'),
        body('new_password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    ]
};

// Pet validation rules
const petValidation = {
    create: [
        body('name').notEmpty().withMessage('Pet name required'),
        body('category').isIn(['dog', 'cat', 'fish', 'bird', 'small_animal', 'reptile']).withMessage('Valid category required'),
        body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
        body('gender').isIn(['male', 'female', 'unknown']).withMessage('Valid gender required')
    ],
    update: [
        body('name').optional().notEmpty(),
        body('price').optional().isFloat({ min: 0 }),
        body('status').optional().isIn(['available', 'pending', 'sold', 'reserved', 'unavailable'])
    ],
    id: [
        param('id').isUUID().withMessage('Valid pet ID required')
    ]
};

// Product validation rules
const productValidation = {
    create: [
        body('name').notEmpty().withMessage('Product name required'),
        body('category').isIn(['food', 'toys', 'beds', 'collars', 'grooming', 'health', 'travel', 'apparel']).withMessage('Valid category required'),
        body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
        body('sku').notEmpty().withMessage('SKU required'),
        body('stock_quantity').isInt({ min: 0 }).withMessage('Valid stock quantity required')
    ],
    id: [
        param('id').isUUID().withMessage('Valid product ID required')
    ]
};

// User validation rules
const userValidation = {
    updateProfile: [
        body('first_name').optional().notEmpty(),
        body('last_name').optional().notEmpty(),
        body('phone').optional().isMobilePhone(),
        body('address_line1').optional(),
        body('city').optional(),
        body('state').optional(),
        body('country').optional(),
        body('postal_code').optional()
    ],
    id: [
        param('id').isUUID().withMessage('Valid user ID required')
    ]
};

// Message validation rules
const messageValidation = {
    send: [
        body('receiver_id').isUUID().withMessage('Valid receiver ID required'),
        body('message_content').notEmpty().withMessage('Message content required')
    ],
    conversationId: [
        param('id').isUUID().withMessage('Valid conversation ID required')
    ]
};

// Comment validation rules
const commentValidation = {
    create: [
        body('comment_type').isIn(['blog', 'guide', 'breed', 'pet']).withMessage('Valid comment type required'),
        body('target_id').isUUID().withMessage('Valid target ID required'),
        body('content').notEmpty().withMessage('Comment content required')
    ],
    id: [
        param('id').isUUID().withMessage('Valid comment ID required')
    ]
};

// Pagination validation
const paginationValidation = [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

module.exports = {
    validate,
    authValidation,
    petValidation,
    productValidation,
    userValidation,
    messageValidation,
    commentValidation,
    paginationValidation
};