/**
 * MikrodCAP M-Pesa Service Layer
 * Integration with Safaricom Daraja API for automated subscription payments.
 */

const fs = require('fs');
const path = require('path');


const getEndpoints = () => {
    const env = process.env.MPESA_ENVIRONMENT || 'sandbox';
    const base = env === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';

    return {
        AUTH: `${base}/oauth/v1/generate?grant_type=client_credentials`,
        STK: `${base}/mpesa/stkpush/v1/processrequest`
    };
};

/**
 * Validates M-Pesa configuration
 */
function validateConfig() {
    const required = [
        'MPESA_CONSUMER_KEY',
        'MPESA_CONSUMER_SECRET',
        'MPESA_SHORTCODE',
        'MPESA_PASSKEY',
        'MPESA_CALLBACK_URL',
        'MPESA_ENVIRONMENT'
    ];

    const missing = required.filter(key => !process.env[key]);
    const env = process.env.MPESA_ENVIRONMENT;
    const isValidEnv = ['sandbox', 'production'].includes(env);

    if (!isValidEnv && env) {
        missing.push('MPESA_ENVIRONMENT (must be sandbox or production)');
    }

    return {
        valid: missing.length === 0,
        missing,
        env
    };
}

/**
 * Generates an OAuth Access Token from Safaricom
 */
async function getAccessToken() {
    const { valid, missing } = validateConfig();
    if (!valid) {
        throw new Error(`M-Pesa configuration incomplete: ${missing.join(', ')}`);
    }

    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const { AUTH } = getEndpoints();

    try {
        const response = await fetch(AUTH, {
            headers: {
                Authorization: `Basic ${auth}`
            }
        });
        const data = await response.json();

        if (response.status !== 200) {
            console.error('[MPESA_AUTH_REJECTED]', data);
            throw new Error(data.errorMessage || 'Safaricom authentication failed');
        }

        return data.access_token;
    } catch (error) {
        console.error('[MPESA_AUTH_ERROR]', error.message);
        throw error;
    }
}

/**
 * Initiates an STK Push (Lipa Na M-Pesa Online)
 */
async function initiateSTKPush(amount, phone, restaurantId) {
    try {
        const accessToken = await getAccessToken();
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const shortCode = process.env.MPESA_SHORTCODE;
        const passkey = process.env.MPESA_PASSKEY;
        const callbackUrl = process.env.MPESA_CALLBACK_URL;

        // Password is Base64(ShortCode + Passkey + Timestamp)
        const password = Buffer.from(shortCode + passkey + timestamp).toString('base64');

        // Normalize phone to 254XXXXXXXXX
        let normalizedPhone = phone.replace(/\D/g, '');
        if (normalizedPhone.startsWith('0')) normalizedPhone = '254' + normalizedPhone.slice(1);
        if (!normalizedPhone.startsWith('254')) normalizedPhone = '254' + normalizedPhone;

        const { STK } = getEndpoints();
        const body = {
            BusinessShortCode: shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerBuyGoodsOnline',
            Amount: amount,
            PartyA: normalizedPhone,
            PartyB: shortCode,
            PhoneNumber: normalizedPhone,
            CallBackURL: callbackUrl,
            AccountReference: `MikrodCAP-${restaurantId}`,
            TransactionDesc: 'Subscription Payment'
        };

        const response = await fetch(STK, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (response.status !== 200) {
            console.error('[MPESA_STK_REJECTED]', {
                status: response.status,
                data: data
            });
        }
        return data;
    } catch (error) {
        console.error('[MPESA_STK_ERROR]', error.message);
        throw error;
    }
}

module.exports = { initiateSTKPush, validateConfig };
