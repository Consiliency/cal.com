#!/bin/bash

DEPLOYMENT_URL="https://fs-cal-b3a7rbncl-jenner-consiliencys-projects.vercel.app"
echo "🔄 Monitoring deployment: $DEPLOYMENT_URL"
echo "Started at: $(date)"
echo "----------------------------------------"

while true; do
    STATUS=$(vercel inspect "$DEPLOYMENT_URL" 2>/dev/null | grep "status" | awk '{print $2}')
    
    if [[ "$STATUS" == "●" ]]; then
        # Still building or error
        STATE=$(vercel inspect "$DEPLOYMENT_URL" 2>/dev/null | grep "status" | awk '{print $3}')
        echo "[$(date +"%H:%M:%S")] Status: $STATE"
        
        if [[ "$STATE" == "Ready" ]]; then
            echo "✅ Deployment successful!"
            vercel inspect "$DEPLOYMENT_URL"
            break
        elif [[ "$STATE" == "Error" ]]; then
            echo "❌ Deployment failed!"
            vercel inspect "$DEPLOYMENT_URL"
            echo ""
            echo "Checking logs..."
            vercel logs "$DEPLOYMENT_URL" --limit 50
            break
        fi
    else
        echo "[$(date +"%H:%M:%S")] Status: Unknown ($STATUS)"
    fi
    
    sleep 15
done