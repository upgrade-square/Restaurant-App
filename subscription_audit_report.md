# MikrodCAP Subscription Audit Report

## 1. Database Audit

### Tables/Files
- **Restaurants (backend/data/restaurants.json & backend/prisma/schema.prisma)**
    - `plan`: Stores the current plan (Starter, Professional, Enterprise).
    - `subscriptionStatus`: Stores status (Trial, Active, Expired, Inactive, Suspended).
    - `subscriptionExpiry`: ISO timestamp for expiration.
- **Subscription Payments (backend/data/subscription_payments.json)**
    - `plan`: Plan purchased.
    - `amount`: Amount paid.
    - `transactionCode`: M-Pesa code.
    - `date`: Payment date.

### Relationships
- Restaurants are identified by `id`.
- Payments are linked to restaurants by `restaurantId` (implied in storage logic).

## 2. Backend Audit

### Validation Logic & Middleware
- `checkSubscription`: Middleware that validates `subscriptionExpiry` and `subscriptionStatus`.
- `isProfessional` checks: Blocks Starter users from advanced analytics.
    - Locations: Line 491, 585, 780, 912, 939, 1218 in `server.js`.

### API Endpoints
- `GET /subscription/status`: Returns current plan and expiry.
- `POST /subscription/verify`: Handles STK Push verification and plan updates.
- `POST /subscription/activate`: Admin manual activation.
- `POST /subscription/deactivate`: Admin manual deactivation.

## 3. Frontend Audit

### UI Components
- **Subscription Tab**: Located in `src/App.jsx` (~line 1516).
    - Current Plan display.
    - Plan cards (Starter, Professional, Enterprise).
    - M-Pesa payment section.
    - Subscription history table.
- **Login/Signup**: Plan selection during registration.
- **Dashboard**: Advanced analytics widgets (History, Analytics tabs) have conditional rendering based on `isProfessional`.

### Plan Displays
- Searches for "Starter", "Professional", "Enterprise" yield multiple matches in `App.jsx` styling and logic.

## 4. Key Keywords Found
- `starter`: 75+ occurrences.
- `professional`: 60+ occurrences.
- `enterprise`: 30+ occurrences.
- `subscription`: 200+ occurrences.
- `plan`: 150+ occurrences.
