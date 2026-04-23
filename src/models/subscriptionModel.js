// src/models/subscriptionModel.js
const DB = require('./db');
const { v4: uuidv4 } = require('uuid');

class SubscriptionModel extends DB {
    // Available plan types
    static PLANS = {
        basic: {
            name: 'Basic',
            price_monthly: 9.99,
            price_annual: 99.99,
            features: {
                pet_listing_limit: 5,
                analytics_access: false,
                featured_listing: false,
                priority_support: false
            }
        },
        pro: {
            name: 'Pro',
            price_monthly: 24.99,
            price_annual: 249.99,
            features: {
                pet_listing_limit: 25,
                analytics_access: true,
                featured_listing: true,
                priority_support: false
            }
        },
        premium: {
            name: 'Premium',
            price_monthly: 49.99,
            price_annual: 499.99,
            features: {
                pet_listing_limit: -1, // unlimited
                analytics_access: true,
                featured_listing: true,
                priority_support: true
            }
        }
    };

    // Create new subscription
    static async create(subscriptionData) {
        const {
            user_id, plan_type, billing_cycle,
            price_paid, currency = 'USD',
            start_date, end_date, auto_renew = true,
            payment_method_id = null
        } = subscriptionData;

        // Check if user already has active subscription
        const existing = await this.getUserActiveSubscription(user_id);
        if (existing) {
            throw new Error('User already has an active subscription');
        }

        const id = uuidv4();

        await this.query(
            `INSERT INTO subscriptions (
                id, user_id, plan_type, billing_cycle, status,
                price_paid, currency, start_date, end_date,
                auto_renew, payment_method_id, created_at
            ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, NOW())`,
            [id, user_id, plan_type, billing_cycle, price_paid,
             currency, start_date, end_date, auto_renew, payment_method_id]
        );

        // Create subscription benefits
        await this.createBenefits(id, plan_type);

        return id;
    }

    // Create subscription benefits
    static async createBenefits(subscriptionId, planType) {
        const plan = this.PLANS[planType];
        if (!plan) return;

        const benefits = [
            {
                benefit_type: 'pet_listing_limit',
                benefit_value: plan.features.pet_listing_limit.toString()
            },
            {
                benefit_type: 'analytics_access',
                benefit_value: plan.features.analytics_access ? 'true' : 'false'
            },
            {
                benefit_type: 'featured_listing',
                benefit_value: plan.features.featured_listing ? 'true' : 'false'
            },
            {
                benefit_type: 'priority_support',
                benefit_value: plan.features.priority_support ? 'true' : 'false'
            }
        ];

        for (const benefit of benefits) {
            await this.query(
                `INSERT INTO subscription_benefits (subscription_id, benefit_type, benefit_value, expires_at)
                 VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 YEAR))`,
                [subscriptionId, benefit.benefit_type, benefit.benefit_value]
            );
        }
    }

    // Get user's active subscription
    static async getUserActiveSubscription(userId) {
        const subscription = await this.getOne(
            `SELECT * FROM subscriptions 
             WHERE user_id = ? AND status = 'active' 
             AND end_date > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );

        if (subscription) {
            subscription.benefits = await this.getBenefits(subscription.id);
        }

        return subscription;
    }

    // Get subscription by ID
    static async findById(id) {
        const subscription = await this.getOne(
            `SELECT s.*, u.email, u.first_name, u.last_name
             FROM subscriptions s
             LEFT JOIN users u ON s.user_id = u.id
             WHERE s.id = ?`,
            [id]
        );

        if (subscription) {
            subscription.benefits = await this.getBenefits(id);
        }

        return subscription;
    }

    // Get benefits for subscription
    static async getBenefits(subscriptionId) {
        return await this.query(
            'SELECT * FROM subscription_benefits WHERE subscription_id = ?',
            [subscriptionId]
        );
    }

    // Get all subscriptions for user
    static async getUserSubscriptions(userId) {
        const subscriptions = await this.query(
            `SELECT * FROM subscriptions 
             WHERE user_id = ? 
             ORDER BY created_at DESC`,
            [userId]
        );

        for (const sub of subscriptions) {
            sub.benefits = await this.getBenefits(sub.id);
        }

        return subscriptions;
    }

    // Update subscription
    static async update(id, updateData) {
        const updates = [];
        const params = [];

        const allowedFields = ['plan_type', 'billing_cycle', 'auto_renew', 'payment_method_id'];

        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                updates.push(`${field} = ?`);
                params.push(updateData[field]);
            }
        }

        if (updateData.status) {
            updates.push('status = ?');
            params.push(updateData.status);
        }

        if (updates.length === 0) return false;

        updates.push('updated_at = NOW()');
        params.push(id);

        const sql = `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ?`;
        
        const result = await this.update(sql, params);
        
        if (result > 0 && updateData.plan_type) {
            // Update benefits for new plan
            await this.query('DELETE FROM subscription_benefits WHERE subscription_id = ?', [id]);
            await this.createBenefits(id, updateData.plan_type);
        }

        return result > 0;
    }

    // Cancel subscription
    static async cancel(id, userId = null) {
        let sql = 'UPDATE subscriptions SET status = "canceled", updated_at = NOW() WHERE id = ?';
        const params = [id];

        if (userId) {
            sql += ' AND user_id = ?';
            params.push(userId);
        }

        const result = await this.update(sql, params);
        return result > 0;
    }

    // Renew subscription
    static async renew(id) {
        const subscription = await this.findById(id);
        if (!subscription) return false;

        const newEndDate = subscription.billing_cycle === 'monthly'
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

        await this.query(
            `UPDATE subscriptions 
             SET end_date = ?, updated_at = NOW()
             WHERE id = ?`,
            [newEndDate.toISOString().slice(0, 19).replace('T', ' '), id]
        );

        return true;
    }

    // Upgrade/Downgrade plan
    static async changePlan(userId, newPlanType, billingCycle = 'monthly') {
        const active = await this.getUserActiveSubscription(userId);
        if (!active) {
            throw new Error('No active subscription found');
        }

        const plan = this.PLANS[newPlanType];
        const price = billingCycle === 'monthly' ? plan.price_monthly : plan.price_annual;

        // Calculate refund for remaining time on current plan
        const now = new Date();
        const endDate = new Date(active.end_date);
        const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
        const totalDays = active.billing_cycle === 'monthly' ? 30 : 365;
        const refundRatio = daysRemaining / totalDays;
        const refundAmount = active.price_paid * refundRatio;

        // Create new subscription
        const startDate = now;
        const newEndDate = billingCycle === 'monthly'
            ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
            : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

        const newSubscriptionId = await this.create({
            user_id: userId,
            plan_type: newPlanType,
            billing_cycle: billingCycle,
            price_paid: price - refundAmount,
            currency: 'USD',
            start_date: startDate.toISOString().slice(0, 19).replace('T', ' '),
            end_date: newEndDate.toISOString().slice(0, 19).replace('T', ' '),
            auto_renew: active.auto_renew,
            payment_method_id: active.payment_method_id
        });

        // Cancel old subscription
        await this.cancel(active.id);

        return {
            new_subscription_id: newSubscriptionId,
            refund_amount: refundAmount,
            days_remaining: daysRemaining,
            price_paid: price - refundAmount
        };
    }

    // Check subscription limits
    static async checkLimit(userId, limitType) {
        const subscription = await this.getUserActiveSubscription(userId);
        
        if (!subscription) {
            // Free tier defaults
            const defaults = {
                pet_listing_limit: 2,
                analytics_access: false,
                featured_listing: false,
                priority_support: false
            };
            return defaults[limitType] ?? null;
        }

        const benefit = subscription.benefits.find(b => b.benefit_type === limitType);
        
        if (!benefit) return null;

        if (limitType === 'pet_listing_limit') {
            const limit = parseInt(benefit.benefit_value);
            if (limit === -1) return Infinity; // unlimited
            return limit;
        }

        return benefit.benefit_value === 'true';
    }

    // Get all active subscriptions
    static async getActiveSubscriptions(page = 1, limit = 20) {
        const offset = (page - 1) * limit;

        const subscriptions = await this.query(
            `SELECT s.*, u.email, u.first_name, u.last_name
             FROM subscriptions s
             INNER JOIN users u ON s.user_id = u.id
             WHERE s.status = 'active' AND s.end_date > NOW()
             ORDER BY s.end_date ASC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const [total] = await this.query(
            'SELECT COUNT(*) as count FROM subscriptions WHERE status = "active" AND end_date > NOW()'
        );

        return {
            data: subscriptions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total.count,
                pages: Math.ceil(total.count / limit)
            }
        };
    }

    // Get expiring subscriptions (for renewal reminders)
    static async getExpiring(days = 7) {
        return await this.query(
            `SELECT s.*, u.email, u.first_name, u.last_name
             FROM subscriptions s
             INNER JOIN users u ON s.user_id = u.id
             WHERE s.status = 'active' 
               AND s.end_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)
               AND s.auto_renew = true
             ORDER BY s.end_date ASC`,
            [days]
        );
    }

    // Get expired subscriptions
    static async getExpired() {
        return await this.query(
            `SELECT s.*, u.email, u.first_name, u.last_name
             FROM subscriptions s
             INNER JOIN users u ON s.user_id = u.id
             WHERE s.status = 'active' AND s.end_date < NOW()`
        );
    }

    // Process expired subscriptions (cron job)
    static async processExpired() {
        const expired = await this.getExpired();

        for (const sub of expired) {
            if (sub.auto_renew) {
                // Attempt to renew
                try {
                    await this.renew(sub.id);
                } catch (error) {
                    // If renewal fails, mark as expired
                    await this.query(
                        'UPDATE subscriptions SET status = "expired" WHERE id = ?',
                        [sub.id]
                    );
                }
            } else {
                // Mark as expired
                await this.query(
                    'UPDATE subscriptions SET status = "expired" WHERE id = ?',
                    [sub.id]
                );
            }
        }

        return expired.length;
    }

    // Get subscription statistics
    static async getStats() {
        const stats = await this.getOne(
            `SELECT 
                COUNT(*) as total_subscriptions,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_subscriptions,
                SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_subscriptions,
                SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) as canceled_subscriptions,
                SUM(CASE WHEN billing_cycle = 'monthly' THEN 1 ELSE 0 END) as monthly_subscriptions,
                SUM(CASE WHEN billing_cycle = 'annual' THEN 1 ELSE 0 END) as annual_subscriptions,
                AVG(price_paid) as avg_price,
                SUM(price_paid) as total_revenue
             FROM subscriptions
             WHERE status = 'active'`
        );

        // Subscriptions by plan
        stats.by_plan = await this.query(
            `SELECT 
                plan_type,
                COUNT(*) as count,
                SUM(price_paid) as revenue
             FROM subscriptions
             WHERE status = 'active'
             GROUP BY plan_type`
        );

        // Monthly revenue
        stats.monthly_revenue = await this.query(
            `SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COUNT(*) as new_subscriptions,
                SUM(price_paid) as revenue
             FROM subscriptions
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
             GROUP BY DATE_FORMAT(created_at, '%Y-%m')
             ORDER BY month DESC`
        );

        return stats;
    }

    // Get user's subscription status
    static async getUserStatus(userId) {
        const subscription = await this.getUserActiveSubscription(userId);
        
        if (!subscription) {
            return {
                has_subscription: false,
                plan: 'free',
                limits: {
                    pet_listing_limit: 2,
                    analytics_access: false,
                    featured_listing: false,
                    priority_support: false
                }
            };
        }

        return {
            has_subscription: true,
            subscription_id: subscription.id,
            plan: subscription.plan_type,
            billing_cycle: subscription.billing_cycle,
            start_date: subscription.start_date,
            end_date: subscription.end_date,
            auto_renew: subscription.auto_renew,
            price: subscription.price_paid,
            currency: subscription.currency,
            benefits: subscription.benefits.reduce((acc, b) => {
                acc[b.benefit_type] = b.benefit_type === 'pet_listing_limit' 
                    ? parseInt(b.benefit_value) 
                    : b.benefit_value === 'true';
                return acc;
            }, {})
        };
    }

    // Calculate prorated price for plan change
    static calculateProratedPrice(currentPlan, newPlan, daysRemaining, billingCycle) {
        const current = this.PLANS[currentPlan];
        const newP = this.PLANS[newPlan];

        const currentPrice = billingCycle === 'monthly' ? current.price_monthly : current.price_annual;
        const newPrice = billingCycle === 'monthly' ? newP.price_monthly : newP.price_annual;

        const totalDays = billingCycle === 'monthly' ? 30 : 365;
        const dailyRate = currentPrice / totalDays;
        const refund = dailyRate * daysRemaining;

        return Math.max(0, newPrice - refund);
    }

    // Get available plans with pricing
    static getAvailablePlans(currency = 'USD') {
        const plans = [];

        for (const [key, plan] of Object.entries(this.PLANS)) {
            plans.push({
                id: key,
                name: plan.name,
                monthly_price: plan.price_monthly,
                annual_price: plan.price_annual,
                savings: Math.round((1 - plan.price_annual / (plan.price_monthly * 12)) * 100),
                features: {
                    pet_listing_limit: plan.features.pet_listing_limit === -1 
                        ? 'Unlimited' 
                        : `${plan.features.pet_listing_limit} pets`,
                    analytics_access: plan.features.analytics_access ? 'Advanced analytics' : 'Basic analytics',
                    featured_listing: plan.features.featured_listing ? 'Featured listings' : 'No featured listings',
                    priority_support: plan.features.priority_support ? 'Priority support' : 'Standard support'
                }
            });
        }

        return plans;
    }

    // Export user subscription data (GDPR)
    static async exportUserData(userId) {
        const subscriptions = await this.query(
            `SELECT 
                plan_type, billing_cycle, status, price_paid,
                currency, start_date, end_date, auto_renew,
                created_at, updated_at, canceled_at
             FROM subscriptions
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        return {
            total_subscriptions: subscriptions.length,
            subscriptions
        };
    }
}

module.exports = SubscriptionModel;