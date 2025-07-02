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