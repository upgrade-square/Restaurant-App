const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Handling BigInt for JSON.stringify (Express response)
BigInt.prototype.toJSON = function () {
    return this.toString();
};

const prismaService = {
    // --- Auth & Users ---
    async getUserByEmail(email) {
        return await prisma.user.findUnique({
            where: { email },
            include: { restaurant: true }
        });
    },

    async createUser(userData) {
        return await prisma.user.create({
            data: {
                ...userData,
                id: BigInt(userData.id || Date.now())
            }
        });
    },

    // --- Restaurants ---
    async getRestaurantById(id) {
        return await prisma.restaurant.findUnique({ where: { id } });
    },

    async getAllRestaurants() {
        return await prisma.restaurant.findMany();
    },

    async updateRestaurant(id, data) {
        return await prisma.restaurant.update({
            where: { id },
            data
        });
    },

    async onboardingRegister(resData, ownerData, settings, templates) {
        return await prisma.$transaction(async (tx) => {
            const restaurant = await tx.restaurant.create({
                data: resData
            });

            const user = await tx.user.create({
                data: {
                    ...ownerData,
                    restaurantId: restaurant.id
                }
            });

            await tx.smsTemplate.create({
                data: {
                    ...templates,
                    restaurantId: restaurant.id
                }
            });

            // Settings are currently handled via a separate logic or integrated into Restaurant/Template
            // For now, mirroring existing storage
            return { restaurant, user };
        });
    },

    // --- Customers ---
    async getCustomersByRestaurant(restaurantId) {
        return await prisma.customer.findMany({
            where: {
                restaurantId,
                active: true
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    async createCustomerAndSms(customerData, smsData) {
        return await prisma.$transaction(async (tx) => {
            const customer = await tx.customer.create({
                data: {
                    ...customerData,
                    id: BigInt(customerData.id)
                }
            });

            const sms = await tx.smsQueue.create({
                data: {
                    ...smsData,
                    id: BigInt(smsData.id),
                    customerId: customer.id
                }
            });

            return { customer, sms };
        });
    },

    async archiveCustomer(id, restaurantId) {
        return await prisma.customer.update({
            where: {
                id: BigInt(id),
                restaurantId
            },
            data: { active: false, archivedAt: new Date() }
        });
    },

    // --- SMS Queue ---
    async getSmsQueue(restaurantId, status) {
        const where = { restaurantId };
        if (status) where.status = status;
        return await prisma.smsQueue.findMany({
            where,
            orderBy: { createdDate: 'desc' }
        });
    },

    async updateSmsStatus(id, restaurantId, status, retryCount, sentAt) {
        return await prisma.smsQueue.update({
            where: {
                id: BigInt(id),
                restaurantId
            },
            data: {
                status,
                retryCount,
                sentAt
            }
        });
    },

    async deleteSms(id, restaurantId) {
        return await prisma.smsQueue.delete({
            where: {
                id: BigInt(id),
                restaurantId
            }
        });
    },

    // --- Templates ---
    async getTemplates(restaurantId) {
        return await prisma.smsTemplate.findUnique({ where: { restaurantId } });
    },

    async updateTemplates(restaurantId, templates) {
        return await prisma.smsTemplate.upsert({
            where: { restaurantId },
            update: templates,
            create: { ...templates, restaurantId }
        });
    },

    // --- Admin Metrics ---
    async getAdminMetrics() {
        const [restaurants, payments, devices] = await Promise.all([
            prisma.restaurant.findMany(),
            prisma.payment.findMany(),
            // Assuming gateway.json is also migrated or handled separately. 
            // For now, keeping it consistent with Prisma scope.
            []
        ]);

        return { restaurants, payments, devices };
    }
};

module.exports = prismaService;
