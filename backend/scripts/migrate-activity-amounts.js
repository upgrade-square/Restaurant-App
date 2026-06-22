const fs = require('fs');
const path = require('path');

const SMS_FILE = path.join(__dirname, '../data/sms_queue.json');
const PAYMENTS_FILE = path.join(__dirname, '../data/payments.json');

function migrate() {
    const smsHistory = JSON.parse(fs.readFileSync(SMS_FILE, 'utf8'));
    const payments = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));

    let updatedCount = 0;

    const migratedSms = smsHistory.map(sms => {
        // If already has amountPaidSnapshot, skip
        if (sms.amountPaidSnapshot !== undefined) return sms;

        let snapshot = null;

        // If it has 'amount' field, use it
        if (sms.amount && sms.amount !== '-' && sms.amount !== 'M-Pesa') {
            snapshot = parseFloat(sms.amount);
        } else {
            // Find closest payment record
            const smsTime = new Date(sms.createdAt).getTime();
            const restaurantPayments = payments.filter(p => p.restaurantId === sms.restaurantId && p.phone === sms.phone);

            if (restaurantPayments.length > 0) {
                // Find payment closest to smsTime (usually same or slightly before)
                // We'll look for the payment created closest to the SMS within a 2-second window if possible
                // or just the one created exactly at the same time (common for manual entries)
                const closest = restaurantPayments.reduce((prev, curr) => {
                    const currTime = new Date(curr.createdAt).getTime();
                    const prevTime = new Date(prev.createdAt).getTime();
                    return Math.abs(currTime - smsTime) < Math.abs(prevTime - smsTime) ? curr : prev;
                });

                const diff = Math.abs(new Date(closest.createdAt).getTime() - smsTime);
                if (diff < 5000) { // within 5 seconds
                    snapshot = parseFloat(closest.amount) || null;
                }
            }
        }

        updatedCount++;
        return {
            ...sms,
            amountPaidSnapshot: snapshot
        };
    });

    fs.writeFileSync(SMS_FILE, JSON.stringify(migratedSms, null, 2));
    console.log(`Migration complete. Updated ${updatedCount} records.`);
}

migrate();
