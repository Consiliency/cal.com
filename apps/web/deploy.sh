#!/bin/bash
# Vercel deployment script for Cal.com monorepo
# This script runs from apps/web but manages the full monorepo build

set -e

echo "🚀 Starting Cal.com deployment..."

# Navigate to monorepo root
cd ../..

# Show current directory for debugging
echo "📍 Current directory: $(pwd)"

# Check if yarn exists in .yarn/releases
if [ -f ".yarn/releases/yarn-3.8.7.cjs" ]; then
    echo "✅ Found Yarn 3.8.7 in .yarn/releases"
else
    echo "❌ Yarn 3.8.7 not found, using corepack"
    corepack enable
    corepack prepare yarn@3.8.7 --activate
fi

# Install dependencies
echo "📦 Installing dependencies..."
yarn install

# Build the project
echo "🔨 Building project..."
NODE_OPTIONS='--max-old-space-size=8192' yarn build

echo "✅ Build completed successfully!"