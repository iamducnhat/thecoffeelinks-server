#!/bin/bash

BASE_URL="https://server-nu-three-90.vercel.app/api"
echo "Testing Security on $BASE_URL..."

# 1. Test Security Headers
echo "\n[1] Checking Security Headers (CSP, HSTS, X-Frame)..."
curl -I "$BASE_URL/products" 2>/dev/null | grep -E "Strict-Transport-Security|Content-Security-Policy|X-Frame-Options|X-RateLimit-Limit"

# 2. Test Rate Limiting
echo "\n[2] Testing Rate Limiting (Spamming requests)..."
for i in {1..5}; do
    STATUS=$(curl -o /dev/null -s -w "%{http_code}" "$BASE_URL/products")
    if [ "$STATUS" -eq 429 ]; then
        echo "   Request $i: 429 Too Many Requests (Pass)"
        break
    else
        echo "   Request $i: $STATUS"
    fi
done

# 3. Test Invalid Input (Zod Validation)
echo "\n[3] Testing Invalid Input (Expect 400)..."
# Missing name
curl -X POST "$BASE_URL/stores" \
     -H "Content-Type: application/json" \
     -H "X-Admin-Key: $ADMIN_SECRET" \
     -d '{"address": "123 Test St"}' \
     -s | grep "error"

# 4. Test Auth Bypass
echo "\n[4] Testing Auth Bypass (Expect 401)..."
curl -X POST "$BASE_URL/stores" \
     -H "Content-Type: application/json" \
     -d '{"name": "Hacker Store", "address": "123 Hack St"}' \
     -s | grep "error"

echo "\nDone."
