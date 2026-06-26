// Centralized Date and Time Utilities for MikrodCAP
// Standard Timezone: Africa/Nairobi (UTC+3)

const NAIROBI_TZ = 'Africa/Nairobi';

/**
 * Normalizes any timestamp/date input into a Date object
 */
const toDate = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
};

/**
 * Internal helper for Ke-standardized formatting
 */
const formatKE = (date, options) => {
    if (!date) return '---';
    return date.toLocaleString('en-KE', {
        timeZone: NAIROBI_TZ,
        hour12: false,
        ...options
    });
};

/**
 * Returns a relative time string (Just now, 5 mins ago, etc.)
 */
export const getRelativeTime = (timestamp) => {
    const date = toDate(timestamp);
    if (!date) return '---';

    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} mins ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hrs ago`;

    // Compare calendar days
    const nowStr = formatKE(now, { year: 'numeric', month: 'numeric', day: 'numeric' });
    const dateStr = formatKE(date, { year: 'numeric', month: 'numeric', day: 'numeric' });

    if (nowStr === dateStr) return formatKE(date, { hour: '2-digit', minute: '2-digit' });

    // Yesterday check
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = formatKE(yesterday, { year: 'numeric', month: 'numeric', day: 'numeric' });

    const timeStr = formatKE(date, { hour: '2-digit', minute: '2-digit' });
    if (yesterdayStr === dateStr) return `Yesterday, ${timeStr}`;

    // Older
    return formatActivityDate(timestamp);
};

/**
 * Compact date format for table displays (16 Jun, 10:45 or 16 Jun 2026, 10:45)
 */
export const formatActivityDate = (timestamp) => {
    const date = toDate(timestamp);
    if (!date) return '---';

    const now = new Date();
    const timeStr = formatKE(date, { hour: '2-digit', minute: '2-digit' });

    const nowYear = formatKE(now, { year: 'numeric' });
    const targetYear = formatKE(date, { year: 'numeric' });

    if (nowYear === targetYear) {
        return `${formatKE(date, { day: 'numeric', month: 'short' })}, ${timeStr}`;
    }

    return `${formatKE(date, { day: 'numeric', month: 'short', year: 'numeric' })}, ${timeStr}`;
};

/**
 * Alias for backward compatibility or general use
 */
export const formatDateTime = (timestamp) => formatActivityDate(timestamp);

/**
 * Calculates days remaining until a given expiry date
 */
export const calculateDaysRemaining = (expiry) => {
    const date = toDate(expiry);
    if (!date) return 0;

    const now = new Date();
    const diffInTime = date.getTime() - now.getTime();
    const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));

    return diffInDays;
};
