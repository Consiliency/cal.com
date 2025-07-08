# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development
```bash
# Quick start with Docker (includes DB setup)
yarn dx

# Regular development (requires existing DB)
yarn dev

# Start specific apps
yarn workspace @calcom/web dev
yarn workspace @calcom/api dev
```

### Database
```bash
# Run migrations (development)
yarn workspace @calcom/prisma db-migrate

# Deploy migrations (production)
yarn workspace @calcom/prisma db-deploy

# Open Prisma Studio
yarn db-studio

# Seed database
cd packages/prisma && yarn db-seed
```

### Testing
```bash
# Run all tests
yarn test

# E2E tests
yarn test-e2e

# Run specific test file
yarn test:app <path-to-test>

# Unit tests
yarn test-unit
```

### Build & Lint
```bash
# Build all packages
yarn build

# Type checking
yarn type-check

# Linting
yarn lint

# Fix linting issues
yarn lint:fix

# Format code
yarn format
```

## Architecture Overview

Cal.com is a **monorepo** using Yarn workspaces and Turbo, structured as follows:

### Core Applications (`/apps`)
- **`/apps/web`**: Main Next.js application serving the user-facing web app
  - Pages use App Router (`/app` directory)
  - API routes in `/pages/api` (legacy) and `/app/api` (new)
  - Authentication via NextAuth with custom providers
  
- **`/apps/api/v1`**: REST API v1 (legacy, being phased out)
- **`/apps/api/v2`**: REST API v2 built with NestJS (newer, preferred)

### Key Packages (`/packages`)

#### Data Layer
- **`prisma`**: Database schema and migrations
  - Single source of truth for data models
  - Extensive use of relations and indexes
  - Custom Prisma client extensions for common queries

#### API Layer
- **`trpc`**: Type-safe API layer
  - All internal API calls use tRPC procedures
  - Organized by feature (e.g., `viewer.bookings`, `viewer.teams`)
  - Input validation with Zod schemas
  - Middleware for auth, rate limiting, etc.

#### Feature Packages
- **`features`**: Business logic organized by feature
  - `/ee` - Enterprise features (requires license)
  - `/bookings` - Booking flow logic
  - `/auth` - Authentication features
  - `/schedules` - Availability management

#### UI Layer
- **`ui`**: Shared component library
  - Built on Radix UI primitives
  - Styled with Tailwind CSS
  - Fully accessible components
  
- **`platform/atoms`**: Composable UI building blocks
  - Used for embeddable components
  - Framework-agnostic design

#### Integrations
- **`app-store`**: Third-party app integrations
  - Each app has its own directory
  - Standardized app config and API
  - Categories: calendar, video, payment, etc.

## Key Architectural Decisions

### 1. **Database Design**
- PostgreSQL with Prisma ORM
- Soft deletes for critical data
- Extensive use of database indexes
- Event-driven architecture for some features

### 2. **API Design**
- tRPC for internal APIs (type safety)
- REST API v2 for external consumers
- GraphQL considered but rejected for complexity

### 3. **Authentication**
- NextAuth.js with multiple providers
- JWT for session management
- Custom SAML implementation for enterprise

### 4. **Multi-tenancy**
- Organizations as top-level entities
- Team-based permissions
- Platform API for white-label solutions

### 5. **Booking Flow**
- Complex availability calculation system
- Real-time slot checking
- Conflict prevention with database locks
- Support for recurring events and seated events

### 6. **Performance Optimizations**
- Edge functions for geographic distribution
- Redis caching for availability
- Database query optimization
- Static generation where possible

## Development Patterns

### tRPC Procedures
```typescript
// Always use the standard pattern:
export const procedureName = authedProcedure
  .input(z.object({
    // Input validation
  }))
  .query/mutation(async ({ ctx, input }) => {
    // Implementation
  });
```

### Database Queries
```typescript
// Use Prisma client from context
const data = await ctx.prisma.model.findMany({
  where: { userId: ctx.user.id },
  include: { relation: true }
});
```

### Component Structure
```typescript
// Components should be typed and use consistent patterns
interface ComponentProps {
  // Props
}

export function Component({ ...props }: ComponentProps) {
  // Implementation
}
```

### Feature Flags
```typescript
// Check features using:
import { getFeatureFlag } from "@calcom/features/flags/server/utils";

const flag = await getFeatureFlag(prisma, "feature-name");
```

## Testing Strategy

### E2E Tests
- Located in `/apps/web/playwright`
- Test critical user flows
- Use fixtures for test data
- Run against local development server

### Unit Tests
- Colocated with source files
- Focus on business logic
- Mock external dependencies
- Use Vitest for fast execution

## Important Considerations

### 1. **Enterprise Features**
- Code in `/packages/features/ee` requires commercial license
- Use feature flags for enterprise features
- Respect the AGPLv3 license for open-source code

### 2. **Database Migrations**
- Always test migrations locally first
- Consider backward compatibility
- Use `db-migrate` for dev, `db-deploy` for prod

### 3. **API Changes**
- Maintain backward compatibility in REST APIs
- Use versioning for breaking changes
- Document all API changes

### 4. **Security**
- Never commit secrets or API keys
- Use environment variables
- Implement proper input validation
- Follow OWASP guidelines

### 5. **Performance**
- Monitor query performance
- Use appropriate caching strategies
- Optimize images and assets
- Consider edge function deployment

## Debugging Tips

### Common Issues
1. **Type errors**: Run `yarn type-check` to identify issues
2. **Database issues**: Check migrations with `yarn db-studio`
3. **Build failures**: Clear cache with `rm -rf .next` and rebuild
4. **Test failures**: Check for timing issues and proper cleanup

### Useful Commands
```bash
# Reset database
yarn db-nuke && yarn workspace @calcom/prisma db-migrate

# Clear all caches
yarn clean

# Check for circular dependencies
yarn workspace @calcom/web analyze
```