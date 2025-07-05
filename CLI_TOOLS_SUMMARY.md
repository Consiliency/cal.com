# CLI Tools Installation Summary

This document lists all the CLI tools installed for Cal.com development with Vercel deployment.

## Installed Tools

### 1. **Vercel CLI** - v44.2.12
- **Installation**: `npm install -g vercel`
- **Location**: Global npm package
- **Authentication**: `vercel login`
- **Usage**: Deploy to Vercel, manage environment variables

### 2. **Supabase CLI** - v2.31.0
- **Installation**: `yarn add -D supabase` (project dependency)
- **Location**: Project node_modules
- **Note**: Also have v2.24.3 at ~/.local/bin/supabase
- **Usage**: Database migrations, local development

### 3. **GitHub CLI (gh)** - v2.74.2
- **Installation**: Downloaded binary to ~/.local/bin
- **Location**: ~/.local/bin/gh
- **Authentication**: `gh auth login`
- **Usage**: PR management, issue tracking, repo operations

### 4. **Google Cloud SDK (gcloud)** - v529.0.0
- **Installation**: Downloaded and extracted to ~/google-cloud-sdk
- **Location**: ~/google-cloud-sdk
- **Components**: gcloud, bq, gsutil
- **Authentication**: `gcloud init`
- **Usage**: Google Cloud services, secrets management

### 5. **Stripe CLI** - v1.28.0
- **Installation**: Downloaded binary to ~/.local/bin
- **Location**: ~/.local/bin/stripe
- **Authentication**: `stripe login`
- **Usage**: Test Stripe integrations, webhooks

### 6. **GAM7 (Google Workspace Admin)** - v7.05.08
- **Installation**: Downloaded and extracted to ~/GAM
- **Location**: ~/GAM/gam
- **Setup**: Requires `gam create project`, `gam oauth create`
- **Usage**: Google Workspace administration

## Environment Setup

All tools have been added to PATH via ~/.bashrc:
- ~/.local/bin (for gh, stripe, supabase binary)
- ~/google-cloud-sdk (for gcloud)
- ~/GAM (for gam)

## Next Steps

1. **Authenticate CLI tools**:
   ```bash
   vercel login
   gh auth login
   gcloud init
   stripe login
   # GAM requires project setup
   ```

2. **Configure Vercel project**:
   ```bash
   vercel link
   vercel pull  # Pull environment variables
   ```

3. **Set up deployment workflow**:
   - Use `vercel` for preview deployments
   - Use `vercel --prod` for production deployments
   - GitHub integration will auto-deploy on merge

## Useful Commands

```bash
# Vercel
vercel dev              # Local development with Vercel env
vercel env ls           # List environment variables
vercel logs             # View deployment logs

# Supabase
yarn supabase db push   # Push migrations
yarn supabase status    # Check connection

# GitHub
gh pr create            # Create pull request
gh pr list              # List pull requests
gh issue list           # List issues

# Google Cloud
gcloud auth list        # List authenticated accounts
gcloud secrets list     # List secrets
gcloud config list      # Show configuration

# Stripe
stripe listen           # Listen for webhooks
stripe logs tail        # Stream API logs
stripe trigger          # Trigger test events
```