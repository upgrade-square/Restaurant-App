const fs = require('fs');
const path = require('path');

const RESTAURANTS_FILE = 'backend/data/restaurants.json';

const readData = (file) => {
    try {
        const data = fs.readFileSync(file);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

const restaurants = readData(RESTAURANTS_FILE);
const mapped = restaurants.map(res => ({
    id: res.id,
    name: res.name,
    createdAt: res.createdAt,
    subscriptionPlan: res.plan,
    subscriptionStatus: res.subscriptionStatus,
    subscriptionExpiryDate: res.subscriptionExpiry
}));

console.log('Count:', mapped.length);
console.log('Sample:', JSON.stringify(mapped[0], null, 2));
