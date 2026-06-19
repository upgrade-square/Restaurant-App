/**
 * TemplateService
 * Centralized engine for message generation and placeholder replacement.
 */

const PLATFORM_DEFAULT_TEMPLATE = "Hello {name}, thank you for choosing {business_name}. We appreciate your support.";

const TemplateService = {
    /**
     * Renders a message template with provided customer and business data.
     * 
     * @param {string} template - The message template string
     * @param {object} customer - Customer data object { name }
     * @param {object} business - Business data object { business_name }
     * @returns {string} - The rendered message
     */
    render(template, customer = {}, business = {}) {
        if (!template || template.trim().length === 0) {
            template = PLATFORM_DEFAULT_TEMPLATE;
        }

        let rendered = template;

        // Supported Placeholders
        const placeholders = {
            name: (customer.name || "Customer").trim(),
            business_name: (business.business_name || "Business Account").trim()
        };

        // Case-insensitive replacement
        Object.keys(placeholders).forEach(key => {
            const regex = new RegExp(`{${key}}`, 'gi');
            rendered = rendered.replace(regex, placeholders[key]);
        });

        // Remove excessive whitespace
        rendered = rendered.replace(/\s+/g, ' ').trim();

        return rendered;
    },

    /**
     * Validates a template string.
     * 
     * @param {string} template - The template to validate
     * @returns {object} - { valid: boolean, error: string | null }
     */
    validate(template) {
        if (!template || template.trim().length === 0) {
            return { valid: false, error: "Template cannot be empty." };
        }

        if (template.length > 160) {
            // Basic SMS length check, can be adjusted
            // return { valid: false, error: "Template exceeds maximum SMS length (160 characters)." };
        }

        // Check for unsupported placeholders: anything in { } that isn't name or business_name
        const placeholderRegex = /\{([^}]+)\}/g;
        let match;
        const supported = ['name', 'business_name'];

        while ((match = placeholderRegex.exec(template)) !== null) {
            const p = match[1].toLowerCase();
            if (!supported.includes(p)) {
                return { valid: false, error: `Unsupported placeholder: {${match[1]}}` };
            }
        }

        // Consecutive duplicate placeholders
        if (/\{(\w+)\}\s*\{\1\}/i.test(template)) {
            return { valid: false, error: "Consecutive duplicate placeholders are not allowed." };
        }

        return { valid: true, error: null };
    },

    getPlatformDefault() {
        return PLATFORM_DEFAULT_TEMPLATE;
    }
};

module.exports = TemplateService;
