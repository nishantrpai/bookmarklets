#!/bin/bash

# Define the target project name
NAME=$1

# Comprehensive list of AI app generation and modern hosting subdomains
DOMAINS=(
  # AI App Gen / Vibe Coding Subdomains
  "$NAME.vercel.app"      # v0 / Vercel
  "$NAME.lovable.app"     # Lovable.dev
  "$NAME.bolt.new"        # Bolt.new
  "$NAME.replit.app"      # Replit Agent
  
  # Standard Low-Code / No-Code Web App Builders
  "$NAME.bubbleapps.io"   # Bubble.io
  "$NAME.softr.app"       # Softr.io
  "$NAME.glideapp.io"     # Glide Apps
  "$NAME.flutterflow.app" # FlutterFlow
  
  # AI Data & Machine Learning Sandboxes (Python)
  "$NAME.streamlit.app"   # Streamlit Share
  "$NAME.hf.space"        # Hugging Face Spaces / Gradio Apps
  
  # Popular Developer Cloud Platforms
  "$NAME.netlify.app"     # Netlify
  "$://onrender.com"    # Render
  "$NAME.up.railway.app"  # Railway.app
  "$NAME.github.io"       # GitHub Pages static hosting
  "$://amplifyapp.com"  # AWS Amplify
  "$NAME.supabase.co"     # Supabase backend projects
)

echo "🔍 Scanning modern platforms for prefix: '$NAME'..."
echo "======================================================="

for domain in "${DOMAINS[@]}"; do
  # Fetch the HTTP status code (timeout after 5 seconds to prevent hanging)
  STATUS=$(curl -o /dev/null -s -w "%{http_code}" --connect-timeout 5 "https://$domain")

  if [ "$STATUS" -eq 404 ]; then
    echo "✅ [Available / 404]  -> $domain"
  elif [ "$STATUS" -eq 000 ]; then
    echo "💡 [Unregistered / DNS 000] -> $domain"
  else
    echo "🚫 [TAKEN / Status $STATUS] -> $domain"
  fi
done

echo "======================================================="
echo "Done!"
