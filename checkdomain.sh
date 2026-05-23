#!/bin/bash

# Define the target project name
NAME=$1

if [ -z "$NAME" ]; then
  echo "❌ Error: Please provide a project name."
  echo "Usage: $0 <project-name>"
  exit 1
fi

# 1. Global Top-Level Domains (Extensions)
TLDS=(
  "com" "net" "org" "co" "io" "ai" "dev" "app" "xyz" "tech" "me" "biz" "info" "cc" "tv"
)

# 2. Modern Platform Subdomains (Kept intact)
PLATFORMS=(
  "vercel.app"      # v0 / Vercel
  "lovable.app"     # Lovable.dev
  "bolt.new"        # Bolt.new
  "replit.app"      # Replit Agent
  "bubbleapps.io"   # Bubble.io
  "softr.app"       # Softr.io
  "glideapp.io"     # Glide Apps
  "flutterflow.app" # FlutterFlow
  "streamlit.app"   # Streamlit Share
  "hf.space"        # Hugging Face Spaces
  "netlify.app"     # Netlify
  "onrender.com"    # Render
  "up.railway.app"  # Railway.app
  "github.io"       # GitHub Pages
  "amplifyapp.com"  # AWS Amplify
  "supabase.co"     # Supabase
)

echo "🔍 Scanning availability for prefix: '$NAME'..."
echo "======================================================="

# --- Part 1: Scan TLD Extensions ---
echo "🌐 Checking Global Domain Extensions..."
for tld in "${TLDS[@]}"; do
  TARGET="$NAME.$tld"
  
  # Fetch HTTP status code
  STATUS=$(curl -o /dev/null -s -w "%{http_code}" --connect-timeout 3 "https://$TARGET")

  if [ "$STATUS" -eq 404 ]; then
    echo "✅ [Available / 404]        -> $TARGET"
  elif [ "$STATUS" -eq 000 ]; then
    echo "💡 [Unregistered / DNS 000] -> $TARGET"
  else
    echo "🚫 [TAKEN / Status $STATUS]       -> $TARGET"
  fi
done

echo "-------------------------------------------------------"

# --- Part 2: Scan Platform Subdomains ---
echo "🚀 Checking Modern Platform Subdomains..."
for platform in "${PLATFORMS[@]}"; do
  TARGET="$NAME.$platform"
  
  STATUS=$(curl -o /dev/null -s -w "%{http_code}" --connect-timeout 3 "https://$TARGET")

  if [ "$STATUS" -eq 404 ]; then
    echo "✅ [Available / 404]        -> $TARGET"
  elif [ "$STATUS" -eq 000 ]; then
    echo "💡 [Unregistered / DNS 000] -> $TARGET"
  else
    echo "🚫 [TAKEN / Status $STATUS]       -> $TARGET"
  fi
done

echo "======================================================="
echo "Done!"
