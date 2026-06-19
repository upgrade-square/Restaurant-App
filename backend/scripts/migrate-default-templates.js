const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const RESTAURANTS_FILE = path.join(DATA_DIR, 'restaurants.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const PLATFORM_DEFAULT_TEMPLATE = "Hello {name}, thank you for choosing {business_name}. We appreciate your support.";

function migrate() {
    console.log('--- Starting Default Template Migration ---');

    if (!fs.existsSync(RESTAURANTS_FILE)) {
        console.error('restaurants.json not found');
        return;
    }

    const restaurants = JSON.parse(fs.readFileSync(RESTAURANTS_FILE, 'utf8'));
    const settings = fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) : {};

    let updatedCount = 0;

    restaurants.forEach(res => {
        const resSettings = settings[res.id] || {};

        // 1. Set business_name if missing
        if (!res.business_name) {
            res.business_name = resSettings.restaurantName || res.name || "MikrodCAP Business";
            console.log(`Setting business_name for ${res.id}: ${res.business_name}`);
        }

        // 2. Set default_template if missing
        if (!res.default_template) {
            // Check if they had a thankYou template or defaultThanks in settings
            // But we want to standardize, so we fallback to platform default if nothing specific exists
            res.default_template = resSettings.defaultThanks || PLATFORM_DEFAULT_TEMPLATE;

            // Standardize placeholders for the migration
            res.default_template = res.default_template
                .replace(/{{name}}/g, '{name}')
                .replace(/{{businessName}}/g, '{business_name}')
                .replace(/{{restaurantName}}/g, '{business_name}')
                .replace(/{restaurantName}/g, '{business_name}')
                .replace(/{businessName}/g, '{business_name}');

            console.log(`Setting default_template for ${res.id}`);
            updatedCount++;
        }
    });

    fs.writeFileSync(RESTAURANTS_FILE, JSON.stringify(restaurants, null, 2));
    console.log(`--- Migration Complete: ${updatedCount} restaurants updated ---`);
}

migrate();
