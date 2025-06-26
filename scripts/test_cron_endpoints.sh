#!/bin/bash

# Extract values from .env
API_URL=$(grep '^NEXT_PUBLIC_WEBAPP_URL=' .env | cut -d '=' -f2- | tr -d '"')
CRON_API_KEY=$(grep '^CRON_API_KEY=' .env | cut -d '=' -f2- | tr -d '"')

echo "API_URL is: $API_URL"
echo "CRON_API_KEY is: $CRON_API_KEY"

# Test /api/tasks/cron
printf "\nTesting /api/tasks/cron\n"
curl -i -H "x-api-key: $CRON_API_KEY" "$API_URL/api/tasks/cron"

# Test /api/calendar-cache/cron
printf "\nTesting /api/calendar-cache/cron\n"
curl -i -H "x-api-key: $CRON_API_KEY" "$API_URL/api/calendar-cache/cron"

# Test /api/cron/selected-calendars
printf "\nTesting /api/cron/selected-calendars\n"
curl -i -H "x-api-key: $CRON_API_KEY" "$API_URL/api/cron/selected-calendars"

# Test /api/cron/credentials
printf "\nTesting /api/cron/credentials\n"
curl -i -H "x-api-key: $CRON_API_KEY" "$API_URL/api/cron/credentials" 