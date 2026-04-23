const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify connection
const verifyConnection = async () => {
    try {
        await transporter.verify();
        console.log('✅ Email service ready');
        return true;
    } catch (error) {
        console.error('❌ Email service error:', error.message);
        return false;
    }
};

// Send email
const sendEmail = async (to, subject, html, text = '') => {
    try {
        const mailOptions = {
            from: `"PawDeal" <${process.env.EMAIL_FROM}>`,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Email send error:', error.message);
        return { success: false, error: error.message };
    }
};

// Welcome email
const sendWelcomeEmail = async (user) => {
    const subject = 'Welcome to PawDeal!';
    const html = `
        <h1>Welcome ${user.first_name}!</h1>
        <p>Thank you for joining PawDeal. We're excited to have you!</p>
        <p>Start exploring pets and products today.</p>
        <a href="${process.env.FRONTEND_URL}/pets" style="padding: 10px 20px; background-color: #1E4A6F; color: white; text-decoration: none; border-radius: 5px;">Browse Pets</a>
    `;
    return await sendEmail(user.email, subject, html);
};

// Email verification
const sendVerificationEmail = async (user, token) => {
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    const subject = 'Verify Your Email - PawDeal';
    const html = `
        <h1>Email Verification</h1>
        <p>Hi ${user.first_name},</p>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verificationLink}" style="padding: 10px 20px; background-color: #1E4A6F; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
        <p>Or copy this link: ${verificationLink}</p>
        <p>This link expires in 24 hours.</p>
    `;
    return await sendEmail(user.email, subject, html);
};

// Password reset
const sendPasswordResetEmail = async (user, token) => {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const subject = 'Reset Your Password - PawDeal';
    const html = `
        <h1>Password Reset Request</h1>
        <p>Hi ${user.first_name},</p>
        <p>You requested to reset your password. Click the link below:</p>
        <a href="${resetLink}" style="padding: 10px 20px; background-color: #1E4A6F; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>Or copy this link: ${resetLink}</p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
    `;
    return await sendEmail(user.email, subject, html);
};

// Order confirmation
const sendOrderConfirmationEmail = async (user, order) => {
    const subject = `Order Confirmation #${order.order_number}`;
    const html = `
        <h1>Thank You for Your Order!</h1>
        <p>Hi ${user.first_name},</p>
        <p>Your order #${order.order_number} has been confirmed.</p>
        <p>Total: $${order.total_amount}</p>
        <a href="${process.env.FRONTEND_URL}/orders/${order.id}" style="padding: 10px 20px; background-color: #1E4A6F; color: white; text-decoration: none; border-radius: 5px;">View Order</a>
    `;
    return await sendEmail(user.email, subject, html);
};

// New message notification
const sendNewMessageEmail = async (user, sender, messagePreview) => {
    const subject = `New Message from ${sender.first_name}`;
    const html = `
        <h1>You Have a New Message</h1>
        <p>Hi ${user.first_name},</p>
        <p>${sender.first_name} sent you a message:</p>
        <p><em>"${messagePreview}"</em></p>
        <a href="${process.env.FRONTEND_URL}/messages" style="padding: 10px 20px; background-color: #1E4A6F; color: white; text-decoration: none; border-radius: 5px;">View Message</a>
    `;
    return await sendEmail(user.email, subject, html);
};

// Seller verification notification
const sendSellerVerificationEmail = async (user, status) => {
    const subject = `Seller Verification ${status}`;
    const html = `
        <h1>Seller Verification ${status}</h1>
        <p>Hi ${user.first_name},</p>
        <p>Your seller account has been <strong>${status}</strong>.</p>
        ${status === 'verified' ? 
            '<p>You can now start listing your pets and products!</p>' : 
            '<p>Please contact support for more information.</p>'}
        <a href="${process.env.FRONTEND_URL}/dashboard/seller" style="padding: 10px 20px; background-color: #1E4A6F; color: white; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
    `;
    return await sendEmail(user.email, subject, html);
};

module.exports = {
    verifyConnection,
    sendEmail,
    sendWelcomeEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendOrderConfirmationEmail,
    sendNewMessageEmail,
    sendSellerVerificationEmail
};