#!/usr/bin/env bash
# Settings for one environment. Usage: ENV=staging source infra/gcp/config.sh
# Override anything by exporting it first (e.g. PROJECT_ID=my-project).
set -euo pipefail

ENV="${ENV:-staging}"
case "$ENV" in staging|production) ;; *) echo "ENV must be staging or production" >&2; exit 1 ;; esac

PROJECT_ID="${PROJECT_ID:-schoolos-$ENV}"
REGION="${REGION:-asia-south1}"                 # Mumbai (docs/10)
DOMAIN="${DOMAIN:-bastaa.in}"                 # ⏸ product name / domain (SETUP-LATER #5, #14)
GITHUB_REPO="${GITHUB_REPO:-}"                  # owner/name, for keyless deploys from GitHub Actions

REPO="schoolos"                                  # Artifact Registry repository
SQL_INSTANCE="schoolos-$ENV"
DB_NAME="schoolos"
BUCKET_PRIVATE="$PROJECT_ID-private"
BUCKET_PUBLIC="$PROJECT_ID-public"
IMAGE_BASE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO"

# Lean mode (docs/10 §0): staging scales to zero and uses the smallest database;
# production keeps one warm instance with CPU always on so scheduled jobs run.
if [ "$ENV" = production ]; then
  SQL_TIER="${SQL_TIER:-db-custom-1-3840}"; API_MIN=1; WEB_MIN=1; API_CPU_ALWAYS=true; NODE_ENV_VALUE=production
else
  SQL_TIER="${SQL_TIER:-db-f1-micro}";      API_MIN=0; WEB_MIN=0; API_CPU_ALWAYS=false; NODE_ENV_VALUE=staging
fi

SA_API="schoolos-api@$PROJECT_ID.iam.gserviceaccount.com"
SA_WEB="schoolos-web@$PROJECT_ID.iam.gserviceaccount.com"
SA_MIGRATE="schoolos-migrate@$PROJECT_ID.iam.gserviceaccount.com"
SA_DEPLOY="schoolos-deploy@$PROJECT_ID.iam.gserviceaccount.com"
SQL_CONNECTION="$PROJECT_ID:$REGION:$SQL_INSTANCE"
