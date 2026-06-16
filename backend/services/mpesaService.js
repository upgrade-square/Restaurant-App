/**
 * MikrodCAP M-Pesa Service Layer
 * Integration with Safaricom Daraja API for automated subscription payments.
 */

const fs = require('fs');
const path = require('path');

const MPESA_AUTH_URL = process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

const MPESA_STK_URL = process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
    : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

/**
 * Generates an OAuth Access Token from Safaricom
 */
async function getAccessToken() {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
        throw new Error('M-Pesa credentials missing in environment variables');
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    try {
        const response = await fetch(MPESA_AUTH_URL, {
            headers: {
                Authorization: `Basic ${auth}`
            }
        });
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('[MPESA_AUTH_ERROR]', error);
        throw error;
    }
}

/**
 * Initiates an STK Push (Lipa Na M-Pesa Online)
 */
async function initiateSTKPush(amount, phone, restaurantId) {
    const accessToken = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const shortCode = process.env.MPESA_SHORTCODE; // Business Till/Paybill
    const passkey = process.env.MPESA_PASSKEY;

    // Password is Base64(ShortCode + Passkey + Timestamp)
    const password = Buffer.from(shortCode + passkey + timestamp).toString('base64');

    // Normalize phone to 254XXXXXXXXX
    let normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.startsWith('0')) normalizedPhone = '254' + normalizedPhone.slice(1);
    if (!normalizedPhone.startsWith('254')) normalizedPhone = '254' + normalizedPhone;

    const body = {
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerBuyGoodsOnline', // Or CustomerPayBillOnline
        Amount: amount,
        PartyA: normalizedPhone,
        PartyB: shortCode,
        PhoneNumber: normalizedPhone,
        CallBackURL: process.env.MPESA_CALLBACK_URL,
        AccountReference: `MikrodCAP-${restaurantId}`,
        TransactionDesc: 'Subscription Payment'
    };

    try {
        const response = await fetch(MPESA_STK_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('[MPESA_STK_ERROR]', error);
        throw error;
    }
}

module.exports = { initiateSTKPush };
