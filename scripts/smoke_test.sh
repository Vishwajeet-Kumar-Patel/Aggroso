#!/usr/bin/env bash
# Smoke test script for Aggroso Migration Workbench deployment
# Usage: ./scripts/smoke_test.sh [BACKEND_URL] [FRONTEND_URL]

set -e

BACKEND_URL="${1:-http://localhost:8000}"
FRONTEND_URL="${2:-http://localhost:5173}"

echo "=== Aggroso Deployment Smoke Test ==="
echo "Backend URL:  $BACKEND_URL"
echo "Frontend URL: $FRONTEND_URL"
echo "-------------------------------------"

echo "1. Checking Backend Health endpoint..."
HEALTH_RES=$(curl -s "$BACKEND_URL/api/health" || curl -s "$BACKEND_URL/health")
echo "   Response: $HEALTH_RES"
if echo "$HEALTH_RES" | grep -q "status"; then
  echo "   ✅ Backend health check passed."
else
  echo "   ❌ Backend health check failed."
  exit 1
fi

echo "2. Checking Source Schema..."
SCHEMA_RES=$(curl -s "$BACKEND_URL/api/schemas/source")
if echo "$SCHEMA_RES" | grep -q "users"; then
  echo "   ✅ Source schema endpoint passed."
else
  echo "   ❌ Source schema check failed."
  exit 1
fi

echo "3. Checking Active Plan..."
PLAN_RES=$(curl -s "$BACKEND_URL/api/plans/active")
if echo "$PLAN_RES" | grep -q "plan_id"; then
  echo "   ✅ Active plan endpoint passed."
else
  echo "   ❌ Active plan check failed."
  exit 1
fi

echo "4. Checking Frontend Index..."
FRONTEND_RES=$(curl -s -I "$FRONTEND_URL" | head -n 1)
echo "   Response: $FRONTEND_RES"
if echo "$FRONTEND_RES" | grep -q "200"; then
  echo "   ✅ Frontend reachable."
else
  echo "   ⚠️ Frontend returned non-200 status (check if running)."
fi

echo "-------------------------------------"
echo "🎉 Smoke test completed successfully!"
