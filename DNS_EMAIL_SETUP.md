# DNS Configuration for Email Deliverability

## Overview
To ensure emails from info@frontierstrategies.ai are delivered reliably, you need to configure SPF, DKIM, and DMARC records in your DNS provider.

## 1. SPF Record (Sender Policy Framework)

Add this TXT record to your DNS:

```
Type: TXT
Name: @ (or leave blank for root domain)
Value: v=spf1 include:_spf.google.com ~all
TTL: 3600 (or default)
```

This tells receiving servers that Google's mail servers are authorized to send email for frontierstrategies.ai.

## 2. DKIM Record (DomainKeys Identified Mail)

### Step 1: Generate DKIM Key in Google Workspace Admin

1. Go to [Google Admin Console](https://admin.google.com)
2. Navigate to: Apps → Google Workspace → Gmail
3. Click "Authenticate email"
4. Under "Selected domain", choose "frontierstrategies.ai"
5. Click "Generate new record"
6. Select key length: 2048-bit (recommended)
7. Copy the generated values

### Step 2: Add DKIM Record to DNS

```
Type: TXT
Name: google._domainkey
Value: [The long string provided by Google, starting with "v=DKIM1; k=rsa; p=..."]
TTL: 3600 (or default)
```

### Step 3: Activate DKIM in Google Admin

After adding the DNS record (wait 15-30 minutes for propagation):
1. Return to Google Admin Console
2. Click "Start authentication"

## 3. DMARC Record (Domain-based Message Authentication)

Add this TXT record:

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:jenner@consiliency.io; pct=100; adkim=r; aspf=r
TTL: 3600 (or default)
```

### DMARC Policy Explanation:
- `p=quarantine`: Tells receivers to quarantine emails that fail authentication
- `rua=mailto:jenner@consiliency.io`: Where to send aggregate reports
- `pct=100`: Apply policy to 100% of messages
- `adkim=r`: Relaxed DKIM alignment
- `aspf=r`: Relaxed SPF alignment

### Progressive DMARC Implementation (Recommended):

Start with monitoring only:
```
v=DMARC1; p=none; rua=mailto:jenner@consiliency.io
```

After 1-2 weeks with no issues, move to quarantine:
```
v=DMARC1; p=quarantine; rua=mailto:jenner@consiliency.io; pct=25
```

Gradually increase percentage and eventually move to reject:
```
v=DMARC1; p=reject; rua=mailto:jenner@consiliency.io
```

## 4. Additional Records (Optional but Recommended)

### MX Records (if not already configured)
```
Type: MX
Name: @ (or leave blank)
Priority: 1
Value: ASPMX.L.GOOGLE.COM
TTL: 3600

Priority: 5
Value: ALT1.ASPMX.L.GOOGLE.COM

Priority: 5
Value: ALT2.ASPMX.L.GOOGLE.COM

Priority: 10
Value: ALT3.ASPMX.L.GOOGLE.COM

Priority: 10
Value: ALT4.ASPMX.L.GOOGLE.COM
```

## 5. Verification Steps

After adding all records (wait 24-48 hours for full propagation):

### Check SPF:
```bash
# Online tool: https://mxtoolbox.com/spf.aspx
# Enter: frontierstrategies.ai
```

### Check DKIM:
```bash
# Send a test email to: check-auth@verifier.port25.com
# You'll receive a report showing DKIM status
```

### Check DMARC:
```bash
# Online tool: https://mxtoolbox.com/dmarc.aspx
# Enter: frontierstrategies.ai
```

### Full Email Authentication Test:
1. Send an email from info@frontierstrategies.ai to:
   - check-auth@verifier.port25.com
   - Or use mail-tester.com

2. Check the authentication results

## 6. Common DNS Providers

### Cloudflare
- Log in to Cloudflare dashboard
- Select your domain
- Go to DNS settings
- Add records as shown above

### GoDaddy
- Log in to GoDaddy account
- Go to Domain Settings → DNS
- Add records using their interface

### Namecheap
- Log in to Namecheap
- Go to Domain List → Manage → Advanced DNS
- Add records

## 7. Troubleshooting

### SPF Issues:
- Ensure no duplicate SPF records exist
- Check that the record starts with "v=spf1"
- Verify Google Workspace is using the domain

### DKIM Issues:
- Wait for DNS propagation (up to 48 hours)
- Ensure the DKIM key is properly formatted
- Check that DKIM is activated in Google Admin

### DMARC Issues:
- Start with p=none for testing
- Ensure email address in rua= is valid
- Check for typos in the record

## 8. Monitoring

Once DMARC is active, you'll receive daily reports at jenner@consiliency.io showing:
- Who's sending email using your domain
- Authentication results
- Potential spoofing attempts

Consider using a DMARC monitoring service like:
- Postmark DMARC
- dmarcian
- Valimail

## Next Steps

1. Add the SPF record immediately (safe, no risk)
2. Set up DKIM through Google Admin Console
3. Add DMARC in monitoring mode (p=none)
4. Monitor reports for 1-2 weeks
5. Gradually strengthen DMARC policy

This setup will significantly improve email deliverability and protect your domain from spoofing.