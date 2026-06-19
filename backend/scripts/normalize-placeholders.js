const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const RESTAURANTS_FILE = path.join(DATA_DIR, 'restaurants.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

function normalizeTemplate(text) {
    if (!text) return text;
    return text
        .replace(/\{\{name\}\}/gi, '{name}')
        .replace(/\{\{business_name\}\}/gi, '{business_name}')
        .replace(/\{\{businessName\}\}/gi, '{business_name}')
        .replace(/\{\{restaurantName\}\}/gi, '{business_name}')
        .replace(/\{restaurantName\}/gi, '{business_name}')
        .replace(/\{businessName\}/gi, '{business_name}')
        // Handle malformed common ones like {{name} or {name}}
        .replace(/\{\{name\}/gi, '{name}')
        .replace(/\{name\}\}/gi, '{name}')
        .replace(/\{\{business_name\}/gi, '{business_name}')
        .replace(/\{business_name\}\}/gi, '{business_name}');
}

function migrate() {
    console.log('Starting placeholder normalization...');

    // 1. Migrate restaurants.json
    if (fs.existsSync(RESTAURANTS_FILE)) {
        const restaurants = JSON.parse(fs.readFileSync(RESTAURANTS_FILE, 'utf8'));
        restaurants.forEach(res => {
            if (res.default_template) {
                res.default_template = normalizeTemplate(res.default_template);
            }
        });
        fs.writeFileSync(RESTAURANTS_FILE, JSON.stringify(restaurants, null, 2));
        console.log('Normalized restaurants.json');
    }

    // 2. Migrate templates.json
    if (fs.existsSync(TEMPLATES_FILE)) {
        const templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));

        const normalizeDeep = (obj) => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    obj[key] = normalizeTemplate(obj[key]);
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    normalizeDeep(obj[key]);
                }
            }
        };

        normalizeDeep(templates);
        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
        console.log('Normalized templates.json');
    }

    console.log('Normalization complete.');
}

migrate();
