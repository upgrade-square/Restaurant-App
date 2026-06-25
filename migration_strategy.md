# MikrodCAP Subscription Migration Strategy

## Overview
Transition from multi-tier (Starter, Professional, Enterprise) to a single "MikrodCAP Standard" plan.

## Phase 1: Backend Infrastructure (Backward Compatible)
- **Feature Access**: Update `isProfessional` logic to include the `Standard` plan.
- **Trial Logic**: Ensure `Standard` plan is the default for new trials.
- **API Endpoints**: `/subscription/verify` and manual activation logic should handle `Standard` as the primary plan.

## Phase 2: Schema & Data Migration
- **Migration Script**: Create a script `scripts/migrate_to_standard_plan.js` to:
    - Update all restaurants with `plan: "Starter"`, `"Professional"`, or `"Enterprise"` to `plan: "Standard"`.
    - Preserve `subscriptionStatus` and `subscriptionExpiry`.
    - Log all changes for audit purposes.

## Phase 3: Frontend UI Overhaul
- **Subscription Tab**:
    - Replace the triple-card layout with a single "MikrodCAP Standard" card.
    - Update pricing to KES 2,000.
    - List all features as included.
- **Signup Page**:
    - Default plan selection to "Standard".
- **Gated Features**:
    - Update `isProfessional` to be `true` for any restaurant with an active `Standard` plan.

## Phase 4: Customer Preservation
- No changes to `restaurantId` or user credentials.
- M-Pesa phone numbers and gateway configurations remain intact.
- Features like Customer Database and Revenue Tracking become available to everyone previously on "Starter".

## Phase 5: Verification & Cleanup
- Regression testing of all key flows.
- Removal of dead code (old plan checks) once migration is stable.
