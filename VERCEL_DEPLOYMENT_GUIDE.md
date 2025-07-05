# Vercel Deployment Guide for Cal.com

This guide covers the complete setup for deploying Cal.com to Vercel with remote Supabase database and Google Workspace email.

## Prerequisites

All required CLI tools have been installed:
- ✅ Vercel CLI (v44.2.12)
- ✅ Supabase CLI (v2.31.0)
- ✅ GitHub CLI (v2.74.2)
- ✅ Google Cloud SDK (v529.0.0)
- ✅ Stripe CLI (v1.28.0)
- ✅ GAM7 (v7.05.08)

## Initial Setup

### 1. Authenticate CLI Tools

```bash
# Vercel
vercel login

# GitHub
gh auth login

# Google Cloud
gcloud init

# Stripe (if using Stripe)
stripe login
```

### 2. Link Vercel Project

Use the deployment helper script:

```bash
./scripts/vercel-deploy.sh setup
```

Or manually:

```bash
vercel link
vercel pull --yes
```

### 3. Environment Variables

The following environment variables need to be set in Vercel:

#### Core Variables (from .env.local)
```
DATABASE_URL=postgresql://postgres.fwynctseebxbzekeflvw:1gpFUbxcAseBBZdf@aws-0-us-east-1.pooler.supabase.com:5432/postgres
DATABASE_DIRECT_URL=postgresql://postgres.fwynctseebxbzekeflvw:1gpFUbxcAseBBZdf@aws-0-us-east-1.pooler.supabase.com:5432/postgres

NEXTAUTH_SECRET=KWrFADnO0BQly05WUlhm4y6pH7AVMGHxrbqAp8KcZ9s=
CALENDSO_ENCRYPTION_KEY=XmPiiqfV0idVOJBfEJQIEuMNkHJapBGS

EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=465
EMAIL_SERVER_USER=jenner@consiliency.io
EMAIL_SERVER_PASSWORD=[App Password]
EMAIL_FROM=info@frontierstrategies.ai

NEXT_PUBLIC_WEBAPP_URL=https://bookings.frontierstrategies.ai
NEXTAUTH_URL=https://bookings.frontierstrategies.ai
```

#### Google Integration (if needed)
```
GOOGLE_CLIENT_ID=[From Google Cloud Console]
GOOGLE_CLIENT_SECRET=[From Google Cloud Console]
GOOGLE_API_CREDENTIALS=[Service Account JSON]
```

### 4. Set Environment Variables in Vercel

Option 1: Via Dashboard
1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add each variable for Production, Preview, and Development

Option 2: Via CLI
```bash
# Set a variable for all environments
vercel env add DATABASE_URL

# Set for specific environment
vercel env add DATABASE_URL production
```

### 5. Configure Build Settings

In `vercel.json` (already configured):
```json
{
  "buildCommand": "yarn build",
  "outputDirectory": "apps/web/.next",
  "installCommand": "yarn install",
  "framework": "nextjs"
}
```

## Deployment Workflow

### Development
```bash
# Local development with remote services
CALENDSO_ENCRYPTION_KEY="..." DATABASE_URL="..." yarn dev

# Or use .env.local
yarn dev
```

### Preview Deployment
```bash
# Deploy preview (creates unique URL)
vercel

# Or use helper script
./scripts/vercel-deploy.sh preview
```

### Production Deployment
```bash
# Deploy to production
vercel --prod

# Or use helper script
./scripts/vercel-deploy.sh prod
```

## GitHub Integration

### Setup Automatic Deployments
1. Connect GitHub repo to Vercel project
2. Configure branch deployments:
   - `main` → Production
   - Other branches → Preview

### Create Pull Request with Deployment
```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push -u origin feature/my-feature
gh pr create --title "Add new feature" --body "Description"
```

## Monitoring & Debugging

### View Logs
```bash
# Stream live logs
vercel logs

# View specific deployment logs
vercel logs [deployment-url]
```

### Check Deployment Status
```bash
# List recent deployments
vercel ls

# Get deployment details
vercel inspect [deployment-url]
```

### Environment Variables
```bash
# List all env vars
vercel env ls

# Pull latest env vars
vercel pull --yes
```

## Troubleshooting

### Build Failures
1. Check build logs: `vercel logs`
2. Verify environment variables: `vercel env ls`
3. Test local build: `NODE_OPTIONS="--max-old-space-size=8192" yarn build`

### Database Connection Issues
1. Verify DATABASE_URL is set correctly
2. Check Supabase connection pooler settings
3. Ensure SSL mode is configured if needed

### Email Issues
1. Verify Gmail app password is correct
2. Check EMAIL_SERVER_* variables
3. Test with lower security requirements first

### Memory Issues
- Already configured in package.json with NODE_OPTIONS
- Vercel automatically allocates memory based on plan

## Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Use different secrets** for production vs development
3. **Rotate secrets regularly** - Update in Vercel dashboard
4. **Use Google Cloud Secrets** for sensitive data:
   ```bash
   gcloud secrets create my-secret --data-file=-
   gcloud secrets versions access latest --secret="my-secret"
   ```

## Useful Commands Reference

```bash
# Deployment
vercel              # Deploy preview
vercel --prod       # Deploy production
vercel ls           # List deployments
vercel rm [url]     # Remove deployment

# Environment
vercel env ls       # List variables
vercel env add      # Add variable
vercel env rm       # Remove variable
vercel pull         # Pull env to .env.local

# Logs & Debugging
vercel logs         # View logs
vercel inspect      # Inspect deployment
vercel dev          # Local dev with Vercel env

# Project
vercel link         # Link project
vercel switch       # Switch project/team
vercel whoami       # Check authentication
```

## Next Steps

1. Run `./scripts/vercel-deploy.sh setup` to complete initial setup
2. Set all required environment variables in Vercel dashboard
3. Test preview deployment with `vercel`
4. Set up GitHub integration for automatic deployments
5. Configure custom domain in Vercel dashboard