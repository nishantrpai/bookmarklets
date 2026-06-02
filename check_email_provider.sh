#!/bin/bash

# Check if a domain argument was provided
if [ -z "$1" ]; then
    echo "Usage: $0 <domain.com>"
    exit 1
fi

DOMAIN=$1

# Fetch MX records
echo "Checking MX records for $DOMAIN..."
MX_RECORDS=$(dig +short MX "$DOMAIN" | sort -n)

# Check if MX records exist
if [ -z "$MX_RECORDS" ]; then
    echo "❌ No email servers (MX records) found for $DOMAIN."
    exit 0
fi

echo -e "\n--- Analysis Results ---"

# Detect provider based on common MX patterns
if echo "$MX_RECORDS" | grep -iqE "google\.com|googlemail\.com"; then
    echo "📧 Provider: Google Workspace / Gmail"
elif echo "$MX_RECORDS" | grep -iq "://outlook.com"; then
    echo "📧 Provider: Microsoft 365 / Outlook"
elif echo "$MX_RECORDS" | grep -iq "zoho"; then
    echo "📧 Provider: Zoho Mail"
elif echo "$MX_RECORDS" | grep -iq "protonmail"; then
    echo "📧 Provider: Proton Mail"
elif echo "$MX_RECORDS" | grep -iq "yahoodns"; then
    echo "📧 Provider: Yahoo Mail"
elif echo "$MX_RECORDS" | grep -iq "icloud"; then
    echo "📧 Provider: Apple iCloud Custom Email"
else
    echo "📧 Provider: Private or Custom Email Server (Self-hosted, cPanel, or local ISP)"
fi

# Print the raw MX records for transparency
echo -e "\nRaw MX Records (Priority | Server):"
echo "$MX_RECORDS"
