# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cal.com is an open-source scheduling infrastructure platform (Calendly successor) built as a monorepo using modern technologies. It's designed to be both a SaaS platform and self-hostable solution with white-label capabilities.

## Tech Stack

- **Frontend**: Next.js 15.3.0, React 18, TypeScript 5.7.2, Tailwind CSS
- **Backend**: tRPC for type-safe APIs, Prisma ORM with PostgreSQL
- **Monorepo**: Yarn workspaces (v3.4.1), Turbo for build orchestration
- **Auth**: NextAuth.js with multiple providers (Google, SAML, OIDC)
- **Testing**: Playwright for E2E, Vitest for unit tests

## Common Development Commands

```bash
# Install dependencies (requires Node >=18.x)
yarn install

# Development
yarn dev              # Start web app only
yarn dev:all         # Start web + website + console
yarn dev:api         # Start web + API proxy + API
yarn dx              # Start with database setup

# Building
yarn build           # Build web app and dependencies
turbo run build      # Build all packages

# Testing
yarn test            # Run unit tests with Vitest
yarn test:ui         # Run tests with UI
yarn e2e             # Run Playwright E2E tests
yarn test-e2e        # Seed DB + run E2E tests

# Database
yarn prisma studio   # Open Prisma Studio
yarn db-deploy       # Deploy database migrations
yarn db-seed         # Seed database with test data

# Code Quality
yarn lint            # Run ESLint
yarn lint:fix        # Fix linting issues
yarn type-check      # Run TypeScript checks
yarn format          # Format with Prettier

# App Store CLI
yarn app-store create      # Create new app
yarn app-store build       # Build app store
yarn app-store:watch      # Watch mode for app development
```

## Architecture & Key Directories

### Monorepo Structure
- `/apps` - Main applications
  - `/web` - Primary Next.js web application (migrating from Pages to App Router)
  - `/api/v1` - REST API v1
  - `/api/v2` - REST API v2 (Nest.js based)
  - `/ui-playground` - Component documentation
- `/packages` - Shared code and features
  - `/prisma` - Database schema and migrations
  - `/ui` - Shared UI components
  - `/lib` - Core utilities and business logic
  - `/trpc` - tRPC routers and procedures
  - `/features` - Feature-specific modules
  - `/app-store` - Integration apps (50+ integrations)
  - `/platform` - Platform-specific features
  - `/embeds` - Embedding functionality

### Key Architectural Patterns

1. **tRPC Usage**: Type-safe API layer connecting frontend and backend
   - Routers in `packages/trpc/server/routers`
   - Client setup in `apps/web/app/_trpc`
   - Context creation for auth and database access

2. **App Store Pattern**: Extensible integration system
   - Each app in `packages/app-store/[app-name]`
   - Standardized API with `api/` folders
   - Lazy loading for performance

3. **Multi-tenancy**: Organization support with subdomain routing
   - Org-specific middleware
   - Team and organization management

4. **Database Architecture**: 
   - Prisma schema at `packages/prisma/schema.prisma`
   - Complex models for Users, Teams, Organizations, EventTypes, Bookings
   - Credential encryption for security

5. **Feature Flags**: Dynamic feature control
   - Managed through `packages/features/flags`

## Important Considerations

1. **App Router Migration**: The codebase is transitioning from Next.js Pages Router to App Router. Check file location before making changes.

2. **Authentication**: Always use the auth context from tRPC or NextAuth session. Never bypass authentication checks.

3. **Database Queries**: Use Prisma client from the context. Avoid direct database queries.

4. **Type Safety**: Leverage TypeScript and tRPC for end-to-end type safety. Don't use `any` types.

5. **App Store Apps**: When working with integrations:
   - Follow the existing app structure
   - Implement required API methods
   - Test with the specific provider's sandbox

6. **Environment Variables**: 
   - Check `.env.example` for required variables
   - Use `dotenv-checker` to validate env setup
   - App Store apps need `.env.appStore`

7. **Testing**:
   - Write Playwright tests for new features
   - Use fixtures from `apps/web/playwright/fixtures`
   - Test multi-tenant scenarios

8. **Performance**: 
   - Use lazy loading for app store apps
   - Implement proper caching strategies
   - Consider edge function deployment

## Working with Specific Features

### Bookings
- Core booking logic in `packages/features/bookings`
- Complex availability calculations
- Recurring events and seat management

### Webhooks
- Webhook system in `packages/features/webhooks`
- Support for custom endpoints and retries

### Embedding
- Embed functionality in `packages/embeds`
- React and vanilla JS embed options

### Organizations
- Multi-tenant support in `packages/features/oe/organizations`
- Team management and permissions

## Debugging Tips

1. Enable verbose logging with `DEBUG=*` environment variable
2. Use Prisma Studio (`yarn db-studio`) to inspect database
3. Check tRPC errors in Network tab for API issues
4. Run type checking to catch type errors early
5. Use `yarn dev:api` to debug API-specific issues

## Production Code Changes

- **Critical Caution for Production Code**:
  - Exercise extreme caution when modifying functional code as this is a well-vetted, widely-used production codebase.
  - Document ALL production code changes immediately in PRODUCTION_CHANGES.md with:
    * Date of change
    * Files modified
    * Specific changes made
    * Before and after code snippets
    * Reason for the change
    * Impact assessment
    * Commit hash
  - Prefer minimal fixes over extensive refactoring