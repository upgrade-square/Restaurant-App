const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Diagnostic Log File
const EMAIL_LOG_FILE = path.join(__dirname, '../data/email_delivery.json');
const MAX_RETRIES = 3;
const ADMIN_EMAIL = 'admin@mikrodtech.co.ke'; // Placeholder for admin notifications

const logEmailEvent = (email, status, details = {}) => {
    try {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        let logs = [];
        if (fs.existsSync(EMAIL_LOG_FILE)) {
            logs = JSON.parse(fs.readFileSync(EMAIL_LOG_FILE, 'utf8'));
        }
        logs.push({
            timestamp: new Date().toISOString(),
            email,
            status,
            ...details
        });
        fs.writeFileSync(EMAIL_LOG_FILE, JSON.stringify(logs.slice(-500), null, 2)); // Keep last 500
    } catch (err) {
        console.error('Failed to log email event:', err);
    }
};

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT == '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    // Add timeouts to prevent hanging
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
});

const validateEmailConfig = () => {
    const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        const errorMsg = `CRITICAL_ERROR: Missing Email Configuration: ${missing.join(', ')}`;
        console.error(errorMsg);
        return { valid: false, missing };
    }

    // Basic verification of SMTP_FROM format
    if (!process.env.SMTP_FROM.includes('@') || !process.env.SMTP_FROM.includes('<')) {
        console.warn('[EMAIL_CONFIG_WARN] SMTP_FROM should be in "Name <email@domain.com>" format');
    }

    return { valid: true };
};

const testEmailConnection = async () => {
    console.log('[DEBUG] Testing SMTP Connection...');
    try {
        await transporter.verify();
        console.log('✅ [DEBUG] SMTP Connection Verified Successfully');
        return { success: true };
    } catch (error) {
        console.error('❌ [DEBUG] SMTP Connection Failed:', error.message);
        return { success: false, error: error.message };
    }
};

const notifyAdmin = async (errorDetails) => {
    console.error('[CRITICAL_EMAIL_FAILURE]', errorDetails);
    // In a real scenario, we might use a different service (like SMS or PagerDuty) 
    // but here we will log to security events and a loud console warning
    try {
        const securityLogPath = path.join(__dirname, '../data/security_events.json');
        let logs = [];
        if (fs.existsSync(securityLogPath)) {
            logs = JSON.parse(fs.readFileSync(securityLogPath, 'utf8'));
        }
        logs.push({
            timestamp: new Date().toISOString(),
            type: 'EMAIL_SYSTEM_FAILURE',
            details: errorDetails
        });
        fs.writeFileSync(securityLogPath, JSON.stringify(logs.slice(-1000), null, 2));
    } catch (e) {
        console.error('Failed to notify admin via logs:', e);
    }
};

const sendOTPEmail = async (email, otp) => {
    // Validate configuration
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('[EMAIL_WARN] SMTP credentials missing. OTP will be logged to console only.');
        console.log(`[OTP_FALLBACK] Code for ${email}: ${otp}`);
        logEmailEvent(email, 'FALLBACK', { reason: 'config_missing', otp_code: otp });
        // In dev, we might want to continue, but for the "fix" we should alert that config is missing
        // For now, I'll throw error if in "Production mode" logic, but user wants "fix"
        // Let's assume they want a real error if it fails
    }

    const mailOptions = {
        from: process.env.SMTP_FROM || 'MikrodTech <info@mikrodtech.co.ke>',
        to: email,
        subject: 'Your MikrodCAP Verification Code',
        text: `Your verification code is: ${otp}. It will expire in 10 minutes.`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #0072CE; margin: 0;">MikrodCAP</h2>
                    <p style="color: #666; font-size: 14px;">Secure Account Verification</p>
                </div>
                <p>Hello,</p>
                <p>You requested a verification code for sensitive account actions or registration. Please use the following 6-digit code:</p>
                <div style="font-size: 32px; font-weight: bold; background: #f0f7ff; color: #0072CE; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0; letter-spacing: 8px; border: 1px dashed #0072CE;">
                    ${otp}
                </div>
                <p>This code is <strong>valid for 10 minutes</strong> and can only be used once.</p>
                <p style="color: #666; font-size: 13px; margin-top: 25px;">If you did not request this code, your account may be at risk. Please ignore this email and consider changing your password immediately.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="font-size: 12px; color: #999; text-align: center;">&copy; 2026 MikrodCAP Platform. All rights reserved.</p>
            </div>
        `
    };

    let attempts = 0;
    let lastError = null;

    while (attempts < MAX_RETRIES) {
        attempts++;
        try {
            logEmailEvent(email, 'SENDING_ATTEMPT', { attempt: attempts, otp_generated: true });

            if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
                return { success: false, error: 'SMTP configuration is incomplete.' };
            }

            const info = await transporter.sendMail(mailOptions);
            logEmailEvent(email, 'SUCCESS', { messageId: info.messageId, attempts });
            return { success: true, messageId: info.messageId };
        } catch (error) {
            lastError = error;
            logEmailEvent(email, 'ATTEMPT_FAILURE', { attempt: attempts, error: error.message });
            console.error(`[EMAIL_ATTEMPT_${attempts}_FAILED] To ${email}:`, error.message);

            // If not last attempt, wait a bit
            if (attempts < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 2000 * attempts)); // Exponential-ish backoff
            }
        }
    }

    // If we reached here, all retries failed
    await notifyAdmin({
        email,
        totalAttempts: MAX_RETRIES,
        lastError: lastError.message,
        action: 'OTP_DELIVERY'
    });

    return { success: false, error: `Email delivery failed after ${MAX_RETRIES} attempts: ${lastError.message}` };
};

module.exports = {
    sendOTPEmail,
    validateEmailConfig,
    testEmailConnection
};
