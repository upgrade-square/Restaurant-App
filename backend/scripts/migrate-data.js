const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const DATA_DIR = path.join(__dirname, '../data-clean');

async function migrate() {
    console.log('--- Starting Data Migration ---');

    try {
        // 1. Migrate Restaurants
        const restaurants = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'restaurants.json'), 'utf8'));
        console.log(`Found ${restaurants.length} restaurants.`);
        for (const res of restaurants) {
            await prisma.restaurant.upsert({
                where: { id: res.id },
                update: {},
                create: {
                    id: res.id,
                    name: res.name,
                    plan: res.plan,
                    subscriptionStatus: res.subscriptionStatus,
                    subscriptionExpiry: res.subscriptionExpiry ? new Date(res.subscriptionExpiry) : null,
                    createdAt: res.createdAt ? new Date(res.createdAt) : new Date(),
                }
            });
        }
        console.log('Restaurants migrated.');

        // 2. Migrate Users
        const users = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8'));
        for (const user of users) {
            await prisma.user.upsert({
                where: { email: user.email },
                update: {},
                create: {
                    id: BigInt(user.id),
                    name: user.name,
                    email: user.email,
                    passwordHash: user.passwordHash,
                    restaurantId: user.restaurantId || 'default',
                    role: user.role || 'owner',
                    createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
                }
            });
        }
        console.log('Users migrated.');

        // 3. Migrate Customers
        const customers = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'customers.json'), 'utf8'));
        for (const customer of customers) {
            await prisma.customer.upsert({
                where: { id: BigInt(customer.id) },
                update: {},
                create: {
                    id: BigInt(customer.id),
                    restaurantId: customer.restaurantId || 'default',
                    name: customer.name,
                    phone: customer.phone,
                    amount: String(customer.amount),
                    sms_status: customer.sms_status || 'Pending',
                    active: customer.active !== false,
                    timestamp: customer.timestamp,
                    created_at: customer.created_at,
                    createdAt: new Date(), // Real DB timestamp
                    archivedAt: customer.archivedAt ? new Date(customer.archivedAt) : null,
                }
            });
        }
        console.log('Customers migrated.');

        // 4. Migrate SMS Queue
        const smsQueue = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'sms_queue.json'), 'utf8'));
        for (const sms of smsQueue) {
            // Ensure customer exists (sometimes JSON has orphans)
            const customerExists = await prisma.customer.findUnique({ where: { id: BigInt(sms.customerId) } });
            if (!customerExists) {
                console.warn(`Skipping SMS ${sms.id} due to missing customer ${sms.customerId}`);
                continue;
            }

            await prisma.smsQueue.upsert({
                where: { id: BigInt(sms.id) },
                update: {},
                create: {
                    id: BigInt(sms.id),
                    restaurantId: sms.restaurantId || 'default',
                    customerId: BigInt(sms.customerId),
                    customerName: sms.customerName,
                    phone: sms.phone,
                    message: sms.message,
                    status: sms.status || 'Pending',
                    retryCount: sms.retryCount || 0,
                    createdAt: sms.createdAt,
                    updatedAt: sms.updatedAt,
                    sentAt: sms.sentAt,
                }
            });
        }
        console.log('SMS Queue migrated.');

        // 5. Migrate Templates
        const templates = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'templates.json'), 'utf8'));
        // Templates is an object with restaurantId as keys, plus some default keys at root
        const rootTemplates = {
            thankYou: templates.thankYou,
            reservation: templates.reservation,
            promotional: templates.promotional
        };

        for (const key in templates) {
            if (typeof templates[key] === 'object') {
                const resId = key;
                const resTemplates = templates[key];
                await prisma.smsTemplate.upsert({
                    where: { restaurantId: resId },
                    update: {},
                    create: {
                        restaurantId: resId,
                        thankYou: resTemplates.thankYou || rootTemplates.thankYou,
                        reservation: resTemplates.reservation || rootTemplates.reservation,
                        promotional: resTemplates.promotional || rootTemplates.promotional,
                    }
                });
            }
        }
        // Also handle 'default' if not explicitly in object but root exists
        const defaultExists = await prisma.smsTemplate.findUnique({ where: { restaurantId: 'default' } });
        if (!defaultExists) {
            await prisma.smsTemplate.create({
                data: {
                    restaurantId: 'default',
                    thankYou: rootTemplates.thankYou,
                    reservation: rootTemplates.reservation,
                    promotional: rootTemplates.promotional,
                }
            });
        }
        console.log('Templates migrated.');

        // 6. Migrate Payments
        const payments = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'payments.json'), 'utf8'));
        for (const payment of payments) {
            await prisma.payment.upsert({
                where: { transactionCode: payment.transactionCode },
                update: {},
                create: {
                    id: BigInt(payment.id),
                    restaurantId: payment.restaurantId || 'default',
                    transactionCode: payment.transactionCode,
                    name: payment.name,
                    phone: payment.phone,
                    amount: payment.amount && payment.amount !== 'M-Pesa' ? parseFloat(String(payment.amount).replace(/[^0-9.]/g, '')) : null,
                    smsSent: payment.smsSent || false,
                    createdAt: payment.createdAt ? new Date(payment.createdAt) : new Date(),
                }
            });
        }
        console.log('Payments migrated.');

        console.log('--- Migration Successful ---');
    } catch (error) {
        console.error('--- Migration Failed ---');
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
