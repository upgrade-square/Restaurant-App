require('dotenv').config();
const { sendOTPEmail } = require('./services/emailService');

async function testEmail() {
    console.log('--- Email Configuration Test ---');
    console.log(`SMTP_HOST: ${process.env.SMTP_HOST}`);
    console.log(`SMTP_FROM: ${process.env.SMTP_FROM}`);

    const testRecipient = process.env.TEST_EMAIL || 'info@mikrodtech.co.ke';
    const testOTP = '123456';

    console.log(`Sending test OTP to: ${testRecipient}...`);

    try {
        const result = await sendOTPEmail(testRecipient, testOTP);
        if (result.success) {
            console.log('✅ Success! messageId:', result.messageId);
        } else {
            console.error('❌ Failure:', result.error);
        }
    } catch (err) {
        console.error('💥 Crash:', err);
    }
}

testEmail();
