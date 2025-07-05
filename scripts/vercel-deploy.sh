#!/bin/bash

# Vercel Deployment Script for Cal.com
# This script helps manage environment variables and deployment to Vercel

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    print_error "Vercel CLI is not installed. Please run: npm install -g vercel"
    exit 1
fi

# Function to check if logged in to Vercel
check_vercel_auth() {
    if ! vercel whoami &> /dev/null; then
        print_warn "Not logged in to Vercel. Running 'vercel login'..."
        vercel login
    else
        print_info "Logged in to Vercel as: $(vercel whoami)"
    fi
}

# Function to link project
link_project() {
    if [ ! -f ".vercel/project.json" ]; then
        print_info "Linking Vercel project..."
        vercel link
    else
        print_info "Project already linked to Vercel"
    fi
}

# Function to pull environment variables
pull_env() {
    print_info "Pulling environment variables from Vercel..."
    vercel pull --yes
    
    if [ -f ".env.local" ]; then
        print_info "Environment variables saved to .env.local"
    else
        print_warn "No .env.local file created. You may need to set up environment variables in Vercel dashboard."
    fi
}

# Function to list environment variables
list_env() {
    print_info "Listing Vercel environment variables..."
    vercel env ls
}

# Function to deploy
deploy() {
    local env=$1
    
    if [ "$env" == "production" ]; then
        print_info "Deploying to production..."
        vercel --prod
    else
        print_info "Deploying preview..."
        vercel
    fi
}

# Function to check build
check_build() {
    print_info "Running local build to verify..."
    NODE_OPTIONS="--max-old-space-size=8192" yarn build
}

# Main menu
show_menu() {
    echo ""
    echo "Cal.com Vercel Deployment Helper"
    echo "================================"
    echo "1. Check Vercel authentication"
    echo "2. Link project to Vercel"
    echo "3. Pull environment variables"
    echo "4. List environment variables"
    echo "5. Deploy preview"
    echo "6. Deploy to production"
    echo "7. Check local build"
    echo "8. Setup all (1-3)"
    echo "9. Exit"
    echo ""
}

# Main logic
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  auth      - Check Vercel authentication"
    echo "  link      - Link project to Vercel"
    echo "  pull      - Pull environment variables"
    echo "  list      - List environment variables"
    echo "  preview   - Deploy preview"
    echo "  prod      - Deploy to production"
    echo "  build     - Check local build"
    echo "  setup     - Run initial setup (auth, link, pull)"
    echo ""
    echo "If no command is provided, interactive menu will be shown."
    exit 0
fi

# Handle direct commands
case "$1" in
    auth)
        check_vercel_auth
        ;;
    link)
        link_project
        ;;
    pull)
        pull_env
        ;;
    list)
        list_env
        ;;
    preview)
        deploy
        ;;
    prod)
        deploy production
        ;;
    build)
        check_build
        ;;
    setup)
        check_vercel_auth
        link_project
        pull_env
        ;;
    "")
        # Interactive mode
        while true; do
            show_menu
            read -p "Select an option: " choice
            
            case $choice in
                1)
                    check_vercel_auth
                    ;;
                2)
                    link_project
                    ;;
                3)
                    pull_env
                    ;;
                4)
                    list_env
                    ;;
                5)
                    deploy
                    ;;
                6)
                    deploy production
                    ;;
                7)
                    check_build
                    ;;
                8)
                    check_vercel_auth
                    link_project
                    pull_env
                    ;;
                9)
                    print_info "Exiting..."
                    exit 0
                    ;;
                *)
                    print_error "Invalid option. Please try again."
                    ;;
            esac
            
            echo ""
            read -p "Press Enter to continue..."
        done
        ;;
    *)
        print_error "Unknown command: $1"
        echo "Run '$0 --help' for usage information."
        exit 1
        ;;
esac