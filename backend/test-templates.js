const TemplateService = require('./services/templateService');

const testCases = [
    {
        name: "Simple replacement",
        template: "Hello {name}, welcome to {business_name}!",
        customer: { name: "John" },
        business: { business_name: "Coffee Shop" },
        expected: "Hello John, welcome to Coffee Shop!"
    },
    {
        name: "Case insensitivity",
        template: "Hello {NAME}, welcome to {BUSINESS_NAME}!",
        customer: { name: "Alice" },
        business: { name: "Bakery" }, // fallback to .name
        expected: "Hello Alice, welcome to Bakery!"
    },
    {
        name: "Empty data fallback",
        template: "Hello {name}, from {business_name}.",
        customer: {},
        business: {},
        expected: "Hello Customer, from Our Business."
    },
    {
        name: "Validation - Unsupported placeholder",
        template: "Hello {name}, your code is {otp}.",
        validate: true,
        expectedValid: false
    },
    {
        name: "Validation - Consecutive duplicates",
        template: "Hello {name} {name}.",
        validate: true,
        expectedValid: false
    }
];

console.log("--- TemplateService Tests ---");
let passed = 0;

testCases.forEach(tc => {
    if (tc.validate) {
        const result = TemplateService.validate(tc.template);
        if (result.valid === tc.expectedValid) {
            console.log(`\u2705 PASS: ${tc.name}`);
            passed++;
        } else {
            console.log(`\u274c FAIL: ${tc.name} - Expected valid: ${tc.expectedValid}, got: ${result.valid} (${result.error})`);
        }
    } else {
        const result = TemplateService.render(tc.template, tc.customer, tc.business);
        if (result === tc.expected) {
            console.log(`\u2705 PASS: ${tc.name}`);
            passed++;
        } else {
            console.log(`\u274c FAIL: ${tc.name} - Expected: "${tc.expected}", got: "${result}"`);
        }
    }
});

console.log(`--- Results: ${passed}/${testCases.length} Passed ---`);
if (passed !== testCases.length) process.exit(1);
