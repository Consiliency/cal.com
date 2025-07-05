# Production Code Changes Log

This document tracks all production code changes made to the Cal.com repository. Since this is a widely-used open-source project, it's crucial to document any modifications for transparency and caution.

## Change History

### 2025-07-01: Fix Missing searchParams Hook in Settings Layout

**File Changed**: `apps/web/app/(use-page-wrapper)/settings/(settings-layout)/SettingsLayoutAppDirClient.tsx`

**Change Type**: Bug Fix

**Description**: 
Added missing `searchParams` variable definition that was causing a TypeScript compilation error.

**Specific Changes**:
- **Line 731**: Added `const searchParams = useCompatSearchParams();`
- This line was added after `const pathname = usePathname();` in the `SettingsLayoutAppDirClient` component

**Before**:
```typescript
export default function SettingsLayoutAppDirClient({ children, ...rest }: SettingsLayoutProps) {
  const pathname = usePathname();
  const state = useState(false);
  const [sideContainerOpen, setSideContainerOpen] = state;
```

**After**:
```typescript
export default function SettingsLayoutAppDirClient({ children, ...rest }: SettingsLayoutProps) {
  const pathname = usePathname();
  const searchParams = useCompatSearchParams();
  const state = useState(false);
  const [sideContainerOpen, setSideContainerOpen] = state;
```

**Reason for Change**:
- The component was using `searchParams?.get("open")` on lines 755 and 758 without defining `searchParams`
- This caused a TypeScript error: "Cannot find name 'searchParams'"
- The `useCompatSearchParams` hook was already imported but not being used

**Impact**:
- Fixes a compilation error that prevented the project from building
- Enables proper functionality for opening the settings side container via URL parameter (`?open=true`)
- No breaking changes - this restores intended functionality

**Commit**: `9b4837e8f` - "fix: Add missing searchParams hook in SettingsLayoutAppDirClient"

---

## Guidelines for Future Changes

When making changes to this production codebase:

1. **Document all changes** in this file immediately after making them
2. **Include**:
   - Date of change
   - Files modified
   - Specific line numbers and changes
   - Before/after code snippets
   - Reason for the change
   - Potential impact assessment
   - Commit hash and message

3. **Be extra cautious** as this is a widely-used open-source project
4. **Prefer minimal changes** that fix specific issues
5. **Test thoroughly** before committing
6. **Consider opening an issue or PR** on the official Cal.com repository if the fix is generally applicable

## Build Commands

For reference, the project can be built with:
```bash
# Standard build (may fail due to ESLint warnings)
yarn build

# CI build (ignores ESLint warnings, with increased memory)
CI=true NODE_OPTIONS="--max-old-space-size=8192" yarn build
```

---

### 2025-07-01: Environment Variable Configuration for Vercel

**Change Type**: Configuration

**Description**: 
Added critical environment variables to fix deployment issues.

**Environment Variables Added**:
- `SKIP_DB_MIGRATIONS=1` - Prevents database migrations during Vercel build
- `ALLOWED_HOSTNAMES=cal-lj22mv86c-jenner-consiliencys-projects.vercel.app,bookings.frontierstrategies.ai` - Fixes hostname validation warning
- `EMAIL_FROM="jenner@consiliency.io"` - Required for 2FA email notifications

**Reason for Change**:
- Build was failing due to attempted database migrations during deployment
- Application logs showed hostname validation errors
- 2FA setup was returning 500 error due to missing email configuration

**Impact**:
- Enables successful Vercel deployments
- Fixes hostname validation warnings in logs
- Should resolve 2FA setup issues

**Note**: Database migrations confirmed to be already applied to Supabase database (447 migrations, no pending)

---

### 2025-07-02: Add Comprehensive Logging to 2FA Setup Endpoint

**File Changed**: `apps/web/app/api/auth/two-factor/totp/setup/route.ts`

**Change Type**: Debugging Enhancement

**Description**: 
Added detailed logging throughout the 2FA setup process to diagnose 500 errors occurring in production.

**Specific Changes**:
- **Lines 20-29**: Added try-catch around `parseRequestData` with error logging
- **Lines 31-38**: Added try-catch around `getServerSession` with error logging
- **Lines 50-59**: Added try-catch around database user lookup with error logging
- **Lines 66-67**: Added logging for user identity provider and password hash status
- **Lines 84-89**: Added logging for `CALENDSO_ENCRYPTION_KEY` environment variable check
- **Lines 91-99**: Added try-catch around password verification with error logging
- **Lines 108-144**: Added logging for secret generation, backup codes, database update, and QR code generation
- **Line 147**: Added endpoint route parameter to `defaultResponderForAppDir` for better Sentry tracking

**Key Logging Points**:
- Request start and body parsing
- Session retrieval and validation
- User lookup and authentication checks
- Password verification
- Secret and backup code generation
- Database update operations
- QR code generation

**Reason for Change**:
- Production deployment was experiencing 500 errors on POST to `/api/auth/two-factor/totp/setup`
- No clear error messages were available in logs
- Added comprehensive logging to identify exact failure point

**Impact**:
- No functional changes - only adds logging
- Will help diagnose production issues without affecting normal operation
- Logs will appear in Vercel Function logs for debugging

**Commit**: `6bfde97bf` - "Add detailed logging to 2FA setup endpoint for debugging"

---

### 2025-07-04: Add Missing creationSource Property to Test Files

**Files Changed**: Multiple test files across the codebase

**Change Type**: Test Fix

**Description**: 
Added missing `creationSource` property to test files that create user objects using Prisma mock.

**Specific Changes**:

1. **packages/lib/test/builder.ts**
   - **Line 284**: Added `creationSource: true` to UserPayload type definition
   - **Line 339**: Added `creationSource: CreationSource.WEBAPP` to buildUser function

2. **packages/trpc/server/routers/viewer/organizations/__tests__/createTeams.handler.test.ts**
   - **Line 6**: Added CreationSource import
   - **Line 25**: Added `creationSource: CreationSource.WEBAPP` to createTestUser function

3. **packages/lib/service/attribute/server/assignValueToUser.test.ts**
   - **Line 7**: Added CreationSource import
   - **Line 53**: Added `creationSource: CreationSource.WEBAPP` to createMockUserWithMembership function

4. **packages/lib/service/attribute/server/getAttributes.test.ts**
   - **Line 6**: Added CreationSource import
   - **Line 65**: Added `creationSource: CreationSource.WEBAPP` to user creation

5. **apps/web/lib/__tests__/getTeamMemberEmailFromCrm.test.ts**
   - **Line 11**: Added CreationSource import
   - **Lines 78 and 139**: Added `creationSource: CreationSource.WEBAPP` to both user.create calls

6. **packages/trpc/server/routers/viewer/organizations/createWithPaymentIntent.handler.test.ts**
   - **Line 9**: Added CreationSource import
   - **Line 95**: Added `creationSource: CreationSource.WEBAPP` to createTestUser function

7. **packages/trpc/server/routers/viewer/organizations/intentToCreateOrg.handler.test.ts**
   - **Line 6**: Added CreationSource import
   - **Line 45**: Added `creationSource: CreationSource.WEBAPP` to createTestUser function

8. **packages/trpc/server/routers/loggedInViewer/unlinkConnectedAccount.handler.spec.ts**
   - **Line 5**: Added CreationSource import
   - **Line 36**: Added `creationSource: CreationSource.WEBAPP` to user creation

9. **packages/features/ee/teams/lib/payments.test.ts**
   - **Line 6**: Added CreationSource import
   - Added `creationSource: CreationSource.WEBAPP` to all 4 user.create calls

10. **packages/features/ee/organizations/lib/server/createOrganizationFromOnboarding.test.ts**
    - **Line 13**: Added CreationSource import
    - **Line 85**: Added `creationSource: CreationSource.WEBAPP` to createTestUser function

11. **apps/web/app/api/cron/credentials/__tests__/cron.test.ts**
    - **Line 6**: Added CreationSource import
    - **Line 14**: Added `creationSource: CreationSource.WEBAPP` to createUser function

12. **apps/web/app/api/cron/selected-calendars/__tests__/cron.test.ts**
    - **Line 7**: Added CreationSource import
    - **Line 26**: Added `creationSource: CreationSource.WEBAPP` to createUser function

13. **apps/api/v1/pages/api/slots/_get.test.ts**
    - **Line 9**: Added CreationSource import
    - **Line 23**: Added `creationSource: CreationSource.WEBAPP` to user creation

**Reason for Change**:
- The Prisma schema requires the `creationSource` field for User model as it's a required enum field
- Test files creating mock users were missing this required property, which would cause test failures

**Impact**:
- **Risk Level**: Low
- **Type**: Test-only changes
- **Production Impact**: None - changes only affect test files
- **Behavior Change**: No functional changes to production code
- **Test Coverage**: Ensures test data properly matches schema requirements

**Commit**: [To be added after commit]