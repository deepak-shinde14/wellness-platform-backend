// backend/utils/emailService.js
const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
    port: process.env.EMAIL_PORT || 2525,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Email templates
const templates = {
    welcome: (context) => ({
        subject: 'Welcome to Wellness Platform!',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #10B981;">Welcome ${context.username}!</h1>
                <p>Thank you for joining our wellness community. We're excited to help you achieve your health goals!</p>
                <p>With your account, you can:</p>
                <ul>
                    <li>Set and track wellness goals</li>
                    <li>Book consultations with our nutritionists</li>
                    <li>Access exclusive health content</li>
                    <li>Monitor your progress</li>
                </ul>
                <p>Start your wellness journey by setting your first goal!</p>
                <a href="${process.env.FRONTEND_URL}/dashboard" 
                   style="display: inline-block; padding: 12px 24px; background-color: #10B981; color: white; text-decoration: none; border-radius: 5px;">
                   Go to Dashboard
                </a>
                <p>Best regards,<br>The Wellness Team</p>
            </div>
        `
    }),
    'password-reset': (context) => ({
        subject: 'Password Reset Request',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #10B981;">Password Reset</h2>
                <p>Hello ${context.username},</p>
                <p>You requested to reset your password. Click the link below to set a new password:</p>
                <a href="${context.resetUrl}" 
                   style="display: inline-block; padding: 12px 24px; background-color: #10B981; color: white; text-decoration: none; border-radius: 5px;">
                   Reset Password
                </a>
                <p>This link will expire in ${context.expiresIn}.</p>
                <p>If you didn't request this, please ignore this email.</p>
                <p>Best regards,<br>The Wellness Team</p>
            </div>
        `
    }),
    'password-reset-confirm': (context) => ({
        subject: 'Password Reset Successful',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #10B981;">Password Changed Successfully</h2>
                <p>Hello ${context.username},</p>
                <p>Your password has been successfully reset.</p>
                <p>If you did not make this change, please contact us immediately.</p>
                <p>Best regards,<br>The Wellness Team</p>
            </div>
        `
    }),
    'consultation-confirmation': (context) => ({
        subject: 'Consultation Confirmation',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #10B981;">Consultation Confirmed!</h2>
                <p>Hello ${context.name},</p>
                <p>Your consultation has been scheduled successfully.</p>
                <div style="background-color: #F3F4F6; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>Date:</strong> ${new Date(context.date).toLocaleDateString()}</p>
                    <p><strong>Time:</strong> ${context.time}</p>
                    <p><strong>Type:</strong> ${context.type}</p>
                    <p><strong>Duration:</strong> ${context.duration} minutes</p>
                </div>
                <p>A reminder will be sent before your appointment.</p>
                <p>Best regards,<br>The Wellness Team</p>
            </div>
        `
    }),
    'progress-reminder': (context) => ({
        subject: "Don't forget to track your progress!",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #10B981;">Keep Going, ${context.username}!</h2>
                <p>Consistency is key to achieving your wellness goals.</p>
                <p>You have ${context.activeGoals} active goals. Don't forget to update your progress!</p>
                <a href="${process.env.FRONTEND_URL}/goals" 
                   style="display: inline-block; padding: 12px 24px; background-color: #10B981; color: white; text-decoration: none; border-radius: 5px;">
                   Update Progress
                </a>
                <p>Best regards,<br>The Wellness Team</p>
            </div>
        `
    })
};

const sendEmail = async ({ to, subject, template, context }) => {
    try {
        // In development or if email is not configured, log instead
        if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_HOST) {
            console.log('Email not sent (development mode):', {
                to,
                subject,
                template,
                context
            });
            return { success: true, preview: true };
        }

        const templateData = templates[template](context);
        
        const mailOptions = {
            from: `"Wellness Platform" <${process.env.EMAIL_FROM || 'noreply@wellness.com'}>`,
            to,
            subject: subject || templateData.subject,
            html: templateData.html
        };

        const info = await transporter.sendMail(mailOptions);
        
        console.log(`Email sent: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
        
    } catch (error) {
        console.error('Email sending failed:', error);
        throw error;
    }
};

module.exports = { sendEmail };