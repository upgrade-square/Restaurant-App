const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../backend/data');
const RESTAURANTS_FILE = path.join(DATA_DIR, 'restaurants.json');

const migrate = () => {
    try {
        if (!fs.existsSync(RESTAURANTS_FILE)) {
            console.error('Restaurants file not found');
            return;
        }

        const data = fs.readFileSync(RESTAURANTS_FILE, 'utf8');
        const restaurants = JSON.parse(data);

        let migratedCount = 0;
        restaurants.forEach(r => {
            if (r.plan !== 'Standard') {
                console.log(`Migrating ${r.name} from ${r.plan || 'No Plan'} to Standard`);
                r.plan = 'Standard';
                migratedCount++;
            }
        });

        if (migratedCount > 0) {
            fs.writeFileSync(RESTAURANTS_FILE, JSON.stringify(restaurants, null, 2));
            console.log(`Successfully migrated ${migratedCount} restaurants to Standard plan.`);
        } else {
            console.log('No restaurants needed migration.');
        }

    } catch (err) {
        console.error('Migration failed:', err);
    }
};

migrate();
