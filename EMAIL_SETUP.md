# Email Configuration Setup

## Google App Password Generation

To complete the email setup, you need to generate a Google App Password:

1. **Sign in to your Google Account**
   - Go to https://myaccount.google.com/apppasswords
   - Use your primary account: jenner@consiliency.io

2. **Enable 2-Step Verification** (if not already enabled)
   - This is required before you can create App Passwords

3. **Generate App Password**
   - Select "Mail" as the app
   - Select "Other (custom name)" as the device
   - Enter "Cal.com" as the name
   - Click "Generate"
   - Copy the 16-character password (it will look like: xxxx xxxx xxxx xxxx)

4. **Add to Environment Variables**
   - Local development:
     ```bash
     # Edit .env file and add:
     EMAIL_SERVER_PASSWORD='your-app-password-here'
     ```
   
   - Production (Vercel):
     ```bash
     echo 'your-app-password-here' | vercel env add EMAIL_SERVER_PASSWORD production
     ```

## Current Email Configuration

- **From Address**: info@frontierstrategies.ai (alias)
- **From Name**: Frontier Strategies
- **SMTP Host**: smtp.gmail.com
- **SMTP Port**: 587
- **Auth User**: jenner@consiliency.io (primary account)
- **Auth Password**: [To be added]

## DNS Configuration (Optional but Recommended)

To improve email deliverability, configure these DNS records for frontierstrategies.ai:

### SPF Record
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.google.com ~all
```

### DKIM Record
1. Enable DKIM in Google Workspace Admin:
   - Go to Admin console > Apps > Google Workspace > Gmail
   - Click "Authenticate email"
   - Generate new record
   - Add the provided TXT record to your DNS

### DMARC Record
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:jenner@consiliency.io
```

## Testing Email Delivery

After adding the App Password:

1. Restart the development server:
   ```bash
   yarn dev
   ```

2. Test by creating a booking that requires payment

3. Check email logs in the console for any errors

## Troubleshooting

- If emails fail with authentication error: Double-check the App Password
- If emails fail with "less secure apps": Ensure using App Password, not regular password
- If alias sending fails: Verify alias is configured in Google Workspace