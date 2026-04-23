// Pet categories
const PET_CATEGORIES = [
    'dog', 'cat', 'fish', 'bird', 'small_animal', 'reptile'
];

// Product categories
const PRODUCT_CATEGORIES = [
    'food', 'toys', 'beds', 'collars', 'grooming', 'health', 'travel', 'apparel'
];

// Pet status
const PET_STATUS = [
    'available', 'pending', 'sold', 'reserved', 'unavailable'
];

// Order status
const ORDER_STATUS = [
    'pending', 'payment_received', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
];

// Payment status
const PAYMENT_STATUS = [
    'pending', 'paid', 'failed', 'refunded'
];

// Payment methods
const PAYMENT_METHODS = [
    'credit_card', 'paypal', 'bank_transfer'
];

// User roles
const USER_ROLES = [
    'user', 'admin'
];

// Account status
const ACCOUNT_STATUS = [
    'active', 'suspended', 'pending'
];

// Verification status
const VERIFICATION_STATUS = [
    'pending', 'verified', 'rejected'
];

// Subscription plans
const SUBSCRIPTION_PLANS = [
    { id: 'basic', name: 'Basic', price: 9.99, petLimit: 5 },
    { id: 'pro', name: 'Pro', price: 24.99, petLimit: 25 },
    { id: 'premium', name: 'Premium', price: 49.99, petLimit: -1 } // -1 means unlimited
];

// Billing cycles
const BILLING_CYCLES = [
    'monthly', 'annual'
];

// Comment types
const COMMENT_TYPES = [
    'blog', 'guide', 'breed', 'pet'
];

// Guide types
const GUIDE_TYPES = [
    'breed', 'care', 'training', 'health', 'buying'
];

// Blog categories
const BLOG_CATEGORIES = [
    'care', 'training', 'health', 'news', 'stories'
];

// Event types
const EVENT_TYPES = [
    'adoption', 'meetup', 'workshop', 'seminar'
];

// Analytics event types
const ANALYTICS_EVENT_TYPES = [
    'page_view', 'pet_view', 'product_view', 'search', 'message_sent', 'favorite_added'
];

// HTTP status codes
const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500
};

// Error messages
const ERROR_MESSAGES = {
    NOT_FOUND: 'Resource not found',
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'You do not have permission',
    INVALID_CREDENTIALS: 'Invalid email or password',
    EMAIL_EXISTS: 'Email already registered',
    ACCOUNT_INACTIVE: 'Account is not active',
    VALIDATION_FAILED: 'Validation failed',
    TOKEN_INVALID: 'Invalid or expired token',
    PET_NOT_FOUND: 'Pet not found',
    PRODUCT_NOT_FOUND: 'Product not found',
    USER_NOT_FOUND: 'User not found',
    ORDER_NOT_FOUND: 'Order not found',
    INSUFFICIENT_STOCK: 'Insufficient stock',
    CART_EMPTY: 'Cart is empty'
};

module.exports = {
    PET_CATEGORIES,
    PRODUCT_CATEGORIES,
    PET_STATUS,
    ORDER_STATUS,
    PAYMENT_STATUS,
    PAYMENT_METHODS,
    USER_ROLES,
    ACCOUNT_STATUS,
    VERIFICATION_STATUS,
    SUBSCRIPTION_PLANS,
    BILLING_CYCLES,
    COMMENT_TYPES,
    GUIDE_TYPES,
    BLOG_CATEGORIES,
    EVENT_TYPES,
    ANALYTICS_EVENT_TYPES,
    HTTP_STATUS,
    ERROR_MESSAGES
};