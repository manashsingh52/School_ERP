#!/usr/bin/env bash
# Build, migrate and deploy SchoolOS to Cloud Run (docs/10, lean mode).
#   ENV=staging ./infra/gcp/deploy.sh            # build → migrate → deploy → smoke test
#   ENV=staging ./infra/gcp/deploy.sh roles      # once, after bootstrap: create the database roles
#   ENV=staging ./infra/gcp/deploy.sh build|migrate|deploy|smoke
#   TAG=<image tag> to deploy an already-built image (default: current git commit)
# GitHub Actions runs the same steps (.github/workflows/deploy.yml).
set -euo pipefail
cd "$(dirname "$0")/../.."
source infra/gcp/config.sh
gcloud config set project "$PROJECT_ID" >/dev/null

TAG="${TAG:-$(git rev-parse --short=12 HEAD)}"
STEP="${1:-all}"
say() { printf '\n▶ %s\n' "$*"; }
has_secret() { gcloud secrets describe "$1" >/dev/null 2>&1; }

# Providers: staging may use the sandbox/console ones; production refuses them (env.ts).
# Until MSG91 is set up (DLT, SETUP-LATER #4) production runs without SMS: people sign in with a
# password or a code from the school office.
if [ "$ENV" = production ]; then
  PAYMENTS_GATEWAY=razorpay
  OTP_PROVIDER=$(has_secret msg91-auth-key && has_secret msg91-otp-template-id && echo msg91 || echo none)
  SMS_PROVIDER=$(has_secret msg91-auth-key && has_secret msg91-sms-template-id && echo msg91 || echo none)
  AI_PROVIDER=$(has_secret gemini-api-key && echo gemini || echo none)
  EMAIL_PROVIDER=$(has_secret resend-api-key && echo resend || echo none)
else
  OTP_PROVIDER=console; PAYMENTS_GATEWAY=mock; SMS_PROVIDER=console
  AI_PROVIDER=$(has_secret gemini-api-key && echo gemini || echo mock)
  EMAIL_PROVIDER=$(has_secret resend-api-key && echo resend || echo console)
fi

# Push (SETUP-LATER #12): on once the Firebase service account is stored as a secret.
PUSH_PROVIDER=$(has_secret fcm-service-account && echo fcm || echo none)

build() {
  say "Building images $TAG in Cloud Build"
  gcloud builds submit --region="$REGION" --config=infra/gcp/cloudbuild.yaml --service-account="projects/$PROJECT_ID/serviceAccounts/$SA_DEPLOY" \
    --substitutions="_IMAGE_BASE=$IMAGE_BASE,_TAG=$TAG" .
}

job() { # job NAME COMMAND SECRETS — run a one-off Cloud Run job with the migrate image and wait
  local name=$1 command=$2 secrets=$3
  gcloud run jobs deploy "$name" --region="$REGION" --image="$IMAGE_BASE/migrate:$TAG" --service-account="$SA_MIGRATE" \
    --set-cloudsql-instances="$SQL_CONNECTION" --set-env-vars=NODE_ENV="$NODE_ENV_VALUE" --set-secrets="$secrets" \
    --command=sh --args=-c,"$command" --max-retries=0 --task-timeout=900s >/dev/null
  gcloud run jobs execute "$name" --region="$REGION" --wait
}

roles() {
  say "Creating database roles (setup-roles.mjs)"
  job schoolos-setup-roles "node scripts/setup-roles.mjs" \
    "ADMIN_DATABASE_URL=database-url-admin:latest,OWNER_PASSWORD=db-owner-password:latest,APP_PASSWORD=db-app-password:latest,PLATFORM_PASSWORD=db-platform-password:latest"
}

migrate() {
  say "Migrating the database (expand-only migrations; safe before the new code is live)"
  job schoolos-migrate "pnpm exec prisma migrate deploy && node scripts/apply-sql.mjs" "DATABASE_URL=database-url-owner:latest"
}

deploy() {
  [ "$OTP_PROVIDER" = none ] && echo "No MSG91 secrets: SMS sign-in codes are off (passwords and school codes only)."
  local secrets="APP_DATABASE_URL=database-url-app:latest,PLATFORM_DATABASE_URL=database-url-platform:latest,JWT_PRIVATE_KEY=jwt-private-key:latest,JWT_PUBLIC_KEY=jwt-public-key:latest,OTP_PEPPER=otp-pepper:latest,PAYMENT_SECRETS_KEY=payment-secrets-key:latest,BFF_SHARED_SECRET=bff-shared-secret:latest,EDGE_SHARED_SECRET=edge-shared-secret:latest"
  [ "$AI_PROVIDER" = gemini ] && secrets="$secrets,GEMINI_API_KEY=gemini-api-key:latest"
  [ "$EMAIL_PROVIDER" = resend ] && secrets="$secrets,RESEND_API_KEY=resend-api-key:latest"
  { [ "$OTP_PROVIDER" = msg91 ] || [ "$SMS_PROVIDER" = msg91 ]; } && secrets="$secrets,MSG91_AUTH_KEY=msg91-auth-key:latest"
  [ "$OTP_PROVIDER" = msg91 ] && secrets="$secrets,MSG91_OTP_TEMPLATE_ID=msg91-otp-template-id:latest"
  [ "$SMS_PROVIDER" = msg91 ] && secrets="$secrets,MSG91_SMS_TEMPLATE_ID=msg91-sms-template-id:latest"
  [ "$PUSH_PROVIDER" = fcm ] && secrets="$secrets,FCM_SERVICE_ACCOUNT_JSON=fcm-service-account:latest"
  has_secret sentry-dsn && secrets="$secrets,SENTRY_DSN=sentry-dsn:latest"
  local env="NODE_ENV=$NODE_ENV_VALUE,LOG_LEVEL=info,RUN_WORKERS=true,DB_POOL_SIZE=5,RATE_LIMIT_STORE=postgres,STORAGE_DRIVER=gcs,GCS_PROJECT_ID=$PROJECT_ID,GCS_PRIVATE_BUCKET=$BUCKET_PRIVATE,GCS_PUBLIC_BUCKET=$BUCKET_PUBLIC,APP_BASE_DOMAIN=$DOMAIN,PUBLIC_API_URL=https://api.$DOMAIN,OTP_PROVIDER=$OTP_PROVIDER,SMS_PROVIDER=$SMS_PROVIDER,EMAIL_PROVIDER=$EMAIL_PROVIDER,RELEASE=$TAG,PUSH_PROVIDER=$PUSH_PROVIDER,FCM_PROJECT_ID=${FCM_PROJECT_ID:-$PROJECT_ID},PAYMENTS_GATEWAY=$PAYMENTS_GATEWAY,AI_PROVIDER=$AI_PROVIDER"
  local throttle=--cpu-throttling
  [ "$API_CPU_ALWAYS" = true ] && throttle=--no-cpu-throttling

  say "Deploying API (with background jobs in-process — lean mode)"
  gcloud run deploy schoolos-api --region="$REGION" --image="$IMAGE_BASE/api:$TAG" --service-account="$SA_API" \
    --add-cloudsql-instances="$SQL_CONNECTION" --port=8080 --cpu=1 --memory=2Gi --concurrency=40 \
    --min-instances="$API_MIN" --max-instances=3 $throttle --allow-unauthenticated \
    --set-env-vars="$env" --set-secrets="$secrets" --quiet
  API_URL=$(gcloud run services describe schoolos-api --region="$REGION" --format='value(status.url)')

  say "Deploying web"
  gcloud run deploy schoolos-web --region="$REGION" --image="$IMAGE_BASE/web:$TAG" --service-account="$SA_WEB" \
    --port=8080 --cpu=1 --memory=512Mi --concurrency=80 --min-instances="$WEB_MIN" --max-instances=5 --allow-unauthenticated \
    --set-env-vars="API_URL=$API_URL,APP_BASE_DOMAIN=$DOMAIN,CLIENT_IP_HEADER=cf-connecting-ip" \
    --set-secrets="BFF_SHARED_SECRET=bff-shared-secret:latest,EDGE_SHARED_SECRET=edge-shared-secret:latest" --quiet
}

smoke() {
  say "Smoke test"
  local api web edge
  api=$(gcloud run services describe schoolos-api --region="$REGION" --format='value(status.url)')
  web=$(gcloud run services describe schoolos-web --region="$REGION" --format='value(status.url)')
  edge=$(gcloud secrets versions access latest --secret=edge-shared-secret)
  curl -fsS "$api/health" >/dev/null && echo "  api /health ok"
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$api/v1/app/config")" = 404 ] && echo "  api refuses requests without the edge secret"
  curl -fsS -H "x-edge-secret: $edge" "$api/v1/app/config" >/dev/null && echo "  api answers through the edge"
  curl -fsS -o /dev/null -H "x-edge-secret: $edge" -H "x-forwarded-host: app.$DOMAIN" "$web/login" && echo "  web /login ok"
  echo "  API: $api"; echo "  Web: $web"
}

case "$STEP" in
  all) build; migrate; deploy; smoke ;;
  roles) gcloud artifacts docker images describe "$IMAGE_BASE/migrate:$TAG" >/dev/null 2>&1 || build; roles ;;
  build) build ;;
  migrate) migrate ;;
  deploy) deploy; smoke ;;
  smoke) smoke ;;
  *) echo "Unknown step $STEP" >&2; exit 1 ;;
esac
