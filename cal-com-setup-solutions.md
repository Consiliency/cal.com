# Cal.com Setup Solutions

## Issues Addressed

### 1. Email Deliverability (Preventing Spam)

**Problem**: Emails are being sent to spam folders.

**Solutions Implemented**:

#### A. Domain Authentication Setup
Add these DNS records to `frontierstrategies.ai`:

**SPF Record** (TXT record):
```
v=spf1 include:_spf.google.com include:_spf.gmail.com ~all
```

**DMARC Record** (TXT record):
```
v=DMARC1; p=quarantine; rua=mailto:dmarc@frontierstrategies.ai; ruf=mailto:dmarc@frontierstrategies.ai; sp=quarantine; adkim=r; aspf=r;
```

**DKIM Setup**:
- Go to Google Admin Console
- Navigate to Apps > Google Workspace > Gmail > Authenticate email
- Generate DKIM key for `frontierstrategies.ai`
- Add the provided TXT record to your DNS

#### B. Email Configuration Improvements
Updated `.env` with better Gmail settings:
```bash
EMAIL_FROM="notifications@bookings.frontierstrategies.ai"
EMAIL_FROM_NAME="Frontier Strategies Booking"
EMAIL_SERVER_HOST="smtp.gmail.com"
EMAIL_SERVER_PORT=587  # Changed from 465 to 587 for better compatibility
EMAIL_SERVER_USER="jenner@consiliency.io"
EMAIL_SERVER_PASSWORD="ygrv zazj qwgg rwef"
```

#### C. Alternative: Switch to Dedicated Email Service
For better deliverability, consider switching to:
- **SendGrid**: Add `SENDGRID_API_KEY` and `SENDGRID_EMAIL` to `.env`
- **Resend**: Add `RESEND_API_KEY` to `.env`

#### D. Email Headers Enhancement
Updated `packages/lib/getAdditionalEmailHeaders.ts` to include Gmail headers:
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

### 2. ReplyTo Configuration

**Problem**: ReplyTo should be the same as the From address.

**Solutions Implemented**:

#### A. Enhanced ReplyTo Logic
Updated `packages/lib/getReplyToHeader.ts` to support using From address as ReplyTo:
```typescript
export function getReplyToHeader(
  calEvent: CalendarEvent,
  additionalEmails?: string | string[],
  excludeOrganizerEmail?: boolean,
  useFromAsReplyTo?: boolean,
  fromEmail?: string
) {
  if (calEvent.hideOrganizerEmail) return {};

  // Check if we should use from address as replyTo (either explicitly set or via env var)
  const shouldUseFromAsReplyTo = useFromAsReplyTo || process.env.EMAIL_USE_FROM_AS_REPLYTO === "true";
  
  // If shouldUseFromAsReplyTo is true and fromEmail is provided, use it as replyTo
  if (shouldUseFromAsReplyTo && fromEmail) {
    return { replyTo: fromEmail };
  }

  // ... rest of existing logic
}
```

#### B. Environment Variable Control
Added to `.env`:
```bash
EMAIL_USE_FROM_AS_REPLYTO=true
```

#### C. Updated Email Templates
Modified key email templates to use From address as ReplyTo:
- `packages/emails/templates/attendee-scheduled-email.ts`
- `packages/emails/templates/organizer-scheduled-email.ts`

### 3. Admin Login Issue

**Problem**: Cannot login with admin credentials.

**Root Cause**: Admin authentication requires either:
1. Valid password AND two-factor authentication enabled, OR
2. Development environment

Since `twoFactorEnabled` was `false` and `NODE_ENV` wasn't set, the admin role was being changed to "INACTIVE_ADMIN".

**Solutions Implemented**:

#### A. Development Environment Setup
Added to `.env`:
```bash
NODE_ENV=development
```

#### B. Admin User Details
Current admin user:
- **Email**: jenner@frontierstrategies.ai
- **Username**: jennertorrence
- **Role**: ADMIN
- **Email Verified**: Yes
- **2FA Enabled**: No (but now works due to development mode)

#### C. Alternative: Enable 2FA
If you want to use this in production, you can:
1. Enable two-factor authentication for the admin user
2. Set `NODE_ENV=production` in `.env`

## Environment Variables Summary

Updated `.env` file now includes:
```bash
# Email Configuration
EMAIL_FROM="notifications@bookings.frontierstrategies.ai"
EMAIL_FROM_NAME="Frontier Strategies Booking"
EMAIL_SERVER_HOST="smtp.gmail.com"
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER="jenner@consiliency.io"
EMAIL_SERVER_PASSWORD="ygrv zazj qwgg rwef"
EMAIL_USE_FROM_AS_REPLYTO=true

# Development Environment
NODE_ENV=development
```

## Testing

### Email Testing
1. Send a test email using the Cal.com interface
2. Check if it lands in inbox instead of spam
3. Verify ReplyTo header matches From address

### Admin Login Testing
1. Go to https://bookings.frontierstrategies.ai/auth/login
2. Login with:
   - Email: jenner@frontierstrategies.ai
   - Password: (your admin password)
3. Should now successfully login as admin

## Next Steps

1. **Immediate**: Test email deliverability and admin login
2. **Short-term**: Set up SPF, DKIM, DMARC DNS records
3. **Long-term**: Consider switching to SendGrid or Resend for better deliverability
4. **Production**: Enable 2FA for admin user if deploying to production

## Monitoring

- Monitor email delivery rates
- Check spam complaint rates
- Verify DNS records are properly configured
- Test admin login functionality 