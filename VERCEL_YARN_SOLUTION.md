# Vercel Deployment Solution for Cal.com Yarn 3 Monorepo

## The Core Problem
Cal.com uses Yarn 3 (Berry) with a specific configuration:
- Yarn binary is stored in `.yarn/releases/yarn-3.8.7.cjs`
- `.yarnrc.yml` has `yarnPath: .yarn/releases/yarn-3.8.7.cjs`
- Vercel can't access this file during build

## Why Current Approaches Fail
1. **`.vercelignore` patterns**: Even with `!.yarn/releases`, Vercel still can't find the yarn binary
2. **Corepack installation**: The `.yarnrc.yml` still points to the local path
3. **Modifying `.yarnrc.yml`**: The command gets too complex and fragile

## The Solution: Include Yarn Binary in Deployment

### Option 1: Remove .yarn from .vercelignore completely
```bash
# Remove these lines from .vercelignore:
# .yarn/cache
# .yarn/install-state.gz
# .yarn/unplugged
```

### Option 2: Use a simpler Vercel configuration
```json
{
  "buildCommand": "yarn build",
  "outputDirectory": "apps/web/.next",
  "installCommand": "yarn install",
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "NODE_OPTIONS": "--max-old-space-size=8192"
  }
}
```

### Option 3: Create a build script
Create `scripts/vercel-build.sh`:
```bash
#!/bin/bash
# Check if yarn exists, if not use npx
if [ -f ".yarn/releases/yarn-3.8.7.cjs" ]; then
  yarn install
  NODE_OPTIONS='--max-old-space-size=8192' yarn build
else
  npx yarn@3.8.7 install
  NODE_OPTIONS='--max-old-space-size=8192' npx yarn@3.8.7 build
fi
```

## Recommended Next Steps
1. Remove `.yarn` exclusions from `.vercelignore` (keep only .yarn/cache)
2. Simplify `vercel.json` to use standard commands
3. Let Vercel use the committed Yarn binary

## Alternative: Migrate to Corepack
If you want to use Corepack instead of committing the Yarn binary:
1. Remove `yarnPath` from `.yarnrc.yml`
2. Add `packageManager: "yarn@3.8.7"` to root `package.json`
3. Vercel will automatically use corepack

## Current Status
- Local development: ✅ Working
- Environment variables: ✅ Fixed
- Root directory: ✅ Fixed
- Yarn installation: ❌ Still failing due to .yarnrc.yml pointing to local path