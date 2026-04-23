// src/controllers/subscriptionController.js
const SubscriptionModel = require('../models/subscriptionModel');
const UserModel = require('../models/userModel');
const { sendEmail } = require('../services/emailService');

// Get all available plans
const getPlans = async (req, res) => {
    try {
        const plans = SubscriptionModel.getAvailablePlans();

        res.json({
            success: true,
            plans
        });
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch subscription plans'
        });
    }
};

// Get user's current subscription
const getCurrentSubscription = async (req, res) => {
    try {
        const userId = req.user.id;

        const subscription = await SubscriptionModel.getUserStatus(userId);

        res.json({
            success: true,
            subscription
        });
    } catch (error) {
        console.error('Get current subscription error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch subscription'
        });
    }
};

// Subscribe to a plan
const subscribe = async (req, res) => {
    try {
        const userId = req.user.id;
        const { plan_type, billing_cycle, payment_method_id } = req.body;

        // Validate plan
        const plans = SubscriptionModel.PLANS;
        if (!plans[plan_type]) {
            return res.status(400).json({
                success: false,
                error: 'Invalid plan type'
            });
        }

        // Check if already subscribed
        const existing = await SubscriptionModel.getUserActiveSubscription(userId);
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'You already have an active subscription. Please upgrade or cancel first.'
            });
        }

        // Calculate dates
        const startDate = new Date();
        const endDate = new Date();
        if (billing_cycle === 'monthly') {
            endDate.setMonth(endDate.getMonth() + 1);
        } else {
            endDate.setFullYear(endDate.getFullYear() + 1);
        }

        // Get price
        const plan = plans[plan_type];
        const price = billing_cycle === 'monthly' 
            ? plan.price_monthly 
            : plan.price_annual;

        // Create subscription
        const subscriptionId = await SubscriptionModel.create({
            user_id: userId,
            plan_type,
            billing_cycle,
            price_paid: price,
            currency: 'USD',
            start_date: startDate.toISOString().slice(0, 19).replace('T', ' '),
            end_date: endDate.toISOString().slice(0, 19).replace('T', ' '),
            auto_renew: true,
            payment_method_id
        });

        // Send confirmation email
        const user = await UserModel.findById(userId);
        await sendEmail(
            user.email,
            'Subscription Confirmed',
            `Your ${plan.name} subscription has been activated!`
        );

        res.status(201).json({
            success: true,
            message: 'Subscription activated successfully',
            subscriptionId,
            plan: {
                type: plan_type,
                name: plan.name,
                price,
                billing_cycle,
                start_date: startDate,
                end_date: endDate
            }
        });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process subscription'
        });
    }
};

// Cancel subscription
const cancelSubscription = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { reason } = req.body;

        // Verify subscription belongs to user
        const subscription = await SubscriptionModel.findById(id);
        if (!subscription) {
            return res.status(404).json({
                success: false,
                error: 'Subscription not found'
            });
        }

        if (subscription.user_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to cancel this subscription'
            });
        }

        await SubscriptionModel.cancel(id, userId);

        // Send cancellation email
        const user = await UserModel.findById(userId);
        await sendEmail(
            user.email,
            'Subscription Cancelled',
            `Your subscription has been cancelled.${reason ? ` Reason: ${reason}` : ''}`
        );

        res.json({
            success: true,
            message: 'Subscription cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel subscription'
        });
    }
};

// Upgrade/Downgrade plan
const changePlan = async (req, res) => {
    try {
        const userId = req.user.id;
        const { new_plan, billing_cycle } = req.body;

        // Validate plan
        const plans = SubscriptionModel.PLANS;
        if (!plans[new_plan]) {
            return res.status(400).json({
                success: false,
                error: 'Invalid plan type'
            });
        }

        const result = await SubscriptionModel.changePlan(userId, new_plan, billing_cycle);

        // Send confirmation email
        const user = await UserModel.findById(userId);
        await sendEmail(
            user.email,
            'Plan Changed Successfully',
            `Your subscription has been changed to ${plans[new_plan].name}. Refund amount: $${result.refund_amount.toFixed(2)}`
        );

        res.json({
            success: true,
            message: 'Plan changed successfully',
            ...result
        });
    } catch (error) {
        console.error('Change plan error:', error);
        if (error.message === 'No active subscription found') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        res.status(500).json({
            success: false,
            error: 'Failed to change plan'
        });
    }
};

// Update auto-renew setting
const updateAutoRenew = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { auto_renew } = req.body;

        // Verify subscription belongs to user
        const subscription = await SubscriptionModel.findById(id);
        if (!subscription) {
            return res.status(404).json({
                success: false,
                error: 'Subscription not found'
            });
        }

        if (subscription.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'You are not authorized to update this subscription'
            });
        }

        await SubscriptionModel.update(id, { auto_renew });

        res.json({
            success: true,
            message: `Auto-renew ${auto_renew ? 'enabled' : 'disabled'} successfully`
        });
    } catch (error) {
        console.error('Update auto-renew error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update auto-renew setting'
        });
    }
};

// Get subscription history
const getSubscriptionHistory = async (req, res) => {
    try {
        const userId = req.user.id;

        const subscriptions = await SubscriptionModel.getUserSubscriptions(userId);

        res.json({
            success: true,
            data: subscriptions
        });
    } catch (error) {
        console.error('Get subscription history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch subscription history'
        });
    }
};

// Get invoices
const getInvoices = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        // Get subscription payments
        const invoices = await SubscriptionModel.query(
            `SELECT 
                s.id,
                s.plan_type,
                s.billing_cycle,
                s.price_paid as amount,
                s.currency,
                s.created_at as date,
                s.status
             FROM subscriptions s
             WHERE s.user_id = ?
             ORDER BY s.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]
        );

        const [total] = await SubscriptionModel.query(
            'SELECT COUNT(*) as count FROM subscriptions WHERE user_id = ?',
            [userId]
        );

        res.json({
            success: true,
            data: invoices,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        });
    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch invoices'
        });
    }
};

// Get specific invoice
const getInvoice = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const invoice = await SubscriptionModel.getOne(
            `SELECT s.*, u.email, u.first_name, u.last_name,
                    u.address_line1, u.city, u.state, u.country, u.postal_code
             FROM subscriptions s
             INNER JOIN users u ON s.user_id = u.id
             WHERE s.id = ? AND s.user_id = ?`,
            [id, userId]
        );

        if (!invoice) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found'
            });
        }

        res.json({
            success: true,
            invoice
        });
    } catch (error) {
        console.error('Get invoice error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch invoice'
        });
    }
};

// Download invoice as PDF (simplified - would need PDF generation library)
const downloadInvoice = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const invoice = await SubscriptionModel.getOne(
            `SELECT s.*, u.email, u.first_name, u.last_name,
                    u.address_line1, u.city, u.state, u.country, u.postal_code
             FROM subscriptions s
             INNER JOIN users u ON s.id = u.id
             WHERE s.id = ? AND s.user_id = ?`,
            [id, userId]
        );

        if (!invoice) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found'
            });
        }

        // For now, return JSON
        res.json({
            success: true,
            invoice
        });

        // In production, you'd generate and return a PDF
        // const PDFDocument = require('pdfkit');
        // const doc = new PDFDocument();
        // res.setHeader('Content-Type', 'application/pdf');
        // res.setHeader('Content-Disposition', `attachment; filename=invoice-${id}.pdf`);
        // doc.pipe(res);
        // ... generate PDF
        // doc.end();
    } catch (error) {
        console.error('Download invoice error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to download invoice'
        });
    }
};

// Get subscription stats (admin)
const getSubscriptionStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const stats = await SubscriptionModel.getStats();

        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        console.error('Get subscription stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get subscription statistics'
        });
    }
};

// Get expiring subscriptions (admin)
const getExpiringSubscriptions = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const { days = 7 } = req.query;

        const expiring = await SubscriptionModel.getExpiring(days);

        res.json({
            success: true,
            data: expiring
        });
    } catch (error) {
        console.error('Get expiring subscriptions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get expiring subscriptions'
        });
    }
};

// Manually renew subscription (admin)
const renewSubscription = async (req, res) => {
    try {
        const { id } = req.params;

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        await SubscriptionModel.renew(id);

        res.json({
            success: true,
            message: 'Subscription renewed successfully'
        });
    } catch (error) {
        console.error('Renew subscription error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to renew subscription'
        });
    }
};

// Check subscription limit
const checkLimit = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit_type } = req.params;

        const limit = await SubscriptionModel.checkLimit(userId, limit_type);

        res.json({
            success: true,
            limit_type,
            limit
        });
    } catch (error) {
        console.error('Check limit error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check limit'
        });
    }
};

// Get payment methods (simplified)
const getPaymentMethods = async (req, res) => {
    try {
        const userId = req.user.id;

        // In production, you'd fetch from your payment provider
        const paymentMethods = [
            {
                id: 'pm_1',
                type: 'card',
                last4: '4242',
                brand: 'visa',
                exp_month: 12,
                exp_year: 2025,
                is_default: true
            }
        ];

        res.json({
            success: true,
            data: paymentMethods
        });
    } catch (error) {
        console.error('Get payment methods error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment methods'
        });
    }
};

// Add payment method (simplified)
const addPaymentMethod = async (req, res) => {
    try {
        const { payment_method_id } = req.body;

        // In production, you'd save to your payment provider
        res.json({
            success: true,
            message: 'Payment method added successfully'
        });
    } catch (error) {
        console.error('Add payment method error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add payment method'
        });
    }
};

// Remove payment method
const removePaymentMethod = async (req, res) => {
    try {
        const { id } = req.params;

        // In production, you'd remove from your payment provider
        res.json({
            success: true,
            message: 'Payment method removed successfully'
        });
    } catch (error) {
        console.error('Remove payment method error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove payment method'
        });
    }
};

// Set default payment method
const setDefaultPaymentMethod = async (req, res) => {
    try {
        const { id } = req.params;

        // In production, you'd update default in your payment provider
        res.json({
            success: true,
            message: 'Default payment method updated'
        });
    } catch (error) {
        console.error('Set default payment method error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to set default payment method'
        });
    }
};

// Apply coupon/discount
const applyCoupon = async (req, res) => {
    try {
        const { coupon_code } = req.body;

        // In production, you'd validate coupon with your payment provider
        // This is a simplified example
        const coupons = {
            'SAVE10': { discount: 10, type: 'percent' },
            'SAVE20': { discount: 20, type: 'percent' },
            'WELCOME5': { discount: 5, type: 'fixed' }
        };

        const coupon = coupons[coupon_code];

        if (!coupon) {
            return res.status(404).json({
                success: false,
                error: 'Invalid coupon code'
            });
        }

        res.json({
            success: true,
            coupon: {
                code: coupon_code,
                discount: coupon.discount,
                type: coupon.type
            }
        });
    } catch (error) {
        console.error('Apply coupon error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to apply coupon'
        });
    }
};

module.exports = {
    getPlans,
    getCurrentSubscription,
    subscribe,
    cancelSubscription,
    changePlan,
    updateAutoRenew,
    getSubscriptionHistory,
    getInvoices,
    getInvoice,
    downloadInvoice,
    getSubscriptionStats,
    getExpiringSubscriptions,
    renewSubscription,
    checkLimit,
    getPaymentMethods,
    addPaymentMethod,
    removePaymentMethod,
    setDefaultPaymentMethod,
    applyCoupon
};