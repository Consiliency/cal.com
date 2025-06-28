# Email Deliverability Setup for Cal.com

## Current Email Configuration
- **From Email**: notifications@bookings.frontierstrategies.ai
- **SMTP Server**: smtp.gmail.com
- **SMTP User**: jenner@consiliency.io

## 1. Domain Authentication (SPF, DKIM, DMARC)

### SPF Record
Add this TXT record to your DNS for `frontierstrategies.ai`:
```
v=spf1 include:_spf.google.com include:_spf.gmail.com ~all
```

### DKIM Setup
Since you're using Gmail SMTP, you need to set up DKIM for your domain:

1. **For Gmail/Google Workspace**:
   - Go to Google Admin Console
   - Navigate to Apps > Google Workspace > Gmail > Authenticate email
   - Generate DKIM key for `frontierstrategies.ai`
   - Add the provided TXT record to your DNS

2. **Alternative: Use a dedicated email service**:
   Consider switching to services like:
   - **SendGrid**: Better deliverability, dedicated IP options
   - **Resend**: Modern API, good deliverability
   - **Mailgun**: Enterprise-grade deliverability

### DMARC Record
Add this TXT record to your DNS for `frontierstrategies.ai`:
```
v=DMARC1; p=quarantine; rua=mailto:dmarc@frontierstrategies.ai; ruf=mailto:dmarc@frontierstrategies.ai; sp=quarantine; adkim=r; aspf=r;
```

## 2. Email Configuration Improvements

### Option A: Switch to SendGrid (Recommended)
```bash
# Add to .env
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_EMAIL=notifications@bookings.frontierstrategies.ai
# Remove EMAIL_SERVER_* variables
```

### Option B: Switch to Resend
```bash
# Add to .env
RESEND_API_KEY=your_resend_api_key
# Remove EMAIL_SERVER_* variables
```

### Option C: Improve Gmail Configuration
```bash
# Update .env with better Gmail settings
EMAIL_FROM="notifications@bookings.frontierstrategies.ai"
EMAIL_FROM_NAME="Frontier Strategies Booking"
EMAIL_SERVER_HOST="smtp.gmail.com"
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER="jenner@consiliency.io"
EMAIL_SERVER_PASSWORD="your_app_password"
```

## 3. Email Headers and Content Best Practices

### Update Email Headers
The current configuration in `packages/lib/getAdditionalEmailHeaders.ts` only has SendGrid headers. Add Gmail headers:

```typescript
export function getAdditionalEmailHeaders(): EmailHostHeaders {
  return {
    "smtp.sendgrid.net": {
      "X-SMTPAPI": JSON.stringify({
        filters: {
          bypass_list_management: {
            settings: {
              enable: 1,
            },
          },
        },
      }),
    },
    "smtp.gmail.com": {
      "X-Mailer": "Cal.com",
      "X-Priority": "3",
      "X-MSMail-Priority": "Normal",
      "Importance": "Normal",
    },
  };
}
```

### Email Content Best Practices
1. **Avoid spam trigger words** in subjects and content
2. **Use proper HTML structure** (already implemented in Cal.com)
3. **Include unsubscribe links** (already implemented)
4. **Maintain consistent sending patterns**
5. **Monitor bounce rates and spam complaints**

## 4. Monitoring and Testing

### Email Testing Tools
- **Mail Tester**: Test your domain reputation
- **MXToolbox**: Check SPF, DKIM, DMARC
- **GlockApps**: Comprehensive deliverability testing

### Monitoring Setup
1. Set up bounce handling
2. Monitor spam complaint rates
3. Track delivery rates
4. Set up feedback loops

## 5. Recommended Action Plan

1. **Immediate**: Set up SPF, DKIM, DMARC records
2. **Short-term**: Switch to SendGrid or Resend
3. **Long-term**: Monitor and optimize based on metrics

## 6. Troubleshooting

### If emails still go to spam:
1. Check domain reputation on tools like SenderScore
2. Verify all DNS records are properly configured
3. Ensure consistent sending patterns
4. Consider using a dedicated IP address
5. Warm up your sending domain gradually 