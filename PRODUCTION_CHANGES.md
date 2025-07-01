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