const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/customers.json');
const BACKUP_FILE = path.join(__dirname, `../data/customers.backup.${Date.now()}.json`);

const normalizePhone = (phone) => {
    if (!phone) return '';
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('254') && cleaned.length === 12) return '0' + cleaned.slice(3);
    if ((cleaned.startsWith('7') || cleaned.startsWith('1')) && cleaned.length === 9) return '0' + cleaned;
    if (cleaned.startsWith('0') && cleaned.length === 10) return cleaned;
    return cleaned;
};

const migrate = () => {
    console.log('--- Starting Customer Uniqueness Migration ---');

    if (!fs.existsSync(DATA_FILE)) {
        console.error('Customer data file not found!');
        return;
    }

    const rawData = fs.readFileSync(DATA_FILE);
    const customers = JSON.parse(rawData);

    console.log(`Initial records: ${customers.length}`);

    // Backup existing data
    fs.writeFileSync(BACKUP_FILE, rawData);
    console.log(`Backup created at: ${BACKUP_FILE}`);

    const mergedCustomers = {};
    let duplicatesFound = 0;

    customers.forEach(c => {
        const phone = normalizePhone(c.phone);
        if (!phone) {
            console.warn(`[WARN] Skipping customer with no phone: ID ${c.id}`);
            return;
        }

        if (mergedCustomers[phone]) {
            // Merge logic
            duplicatesFound++;
            const existing = mergedCustomers[phone];

            // Increment visit count
            existing.visitCount = (existing.visitCount || 1) + (c.visitCount || 1);

            // Merge servedBy lists
            if (c.servedBy) {
                if (!existing.servedBy) existing.servedBy = [];
                c.servedBy.forEach(id => {
                    if (!existing.servedBy.includes(id)) {
                        existing.servedBy.push(id);
                    }
                });
            }

            // Keep the latest lastSeen
            if (c.lastSeen && (!existing.lastSeen || new Date(c.lastSeen) > new Date(existing.lastSeen))) {
                existing.lastSeen = c.lastSeen;
            }

            console.log(`[MERGE] Merging duplicate: ${phone} (${c.name} -> ${existing.name})`);
        } else {
            // New unique phone found
            mergedCustomers[phone] = {
                ...c,
                phone: phone,
                visitCount: c.visitCount || 1
            };
        }
    });

    const finalCustomers = Object.values(mergedCustomers);

    fs.writeFileSync(DATA_FILE, JSON.stringify(finalCustomers, null, 2));

    console.log('--- Migration Completed ---');
    console.log(`Final records: ${finalCustomers.length}`);
    console.log(`Duplicates merged: ${duplicatesFound}`);
};

migrate();
