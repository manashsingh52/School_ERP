#!/usr/bin/env bash
# One-time setup of a Google Cloud project for Bastaa (docs/10, lean mode). Safe to re-run.
#   gcloud auth login && gcloud auth application-default login
#   ENV=staging GITHUB_REPO=owner/schoolerp ./infra/gcp/bootstrap.sh
# Creates: APIs, Artifact Registry, Cloud SQL (Postgres 17), buckets, service accounts, secrets
# (generated, never printed), and keyless GitHub → Google deploy access. Costs money once created —
# see docs/10 §8 and set the budget alerts printed at the end.
set -euo pipefail
cd "$(dirname "$0")/../.."
source infra/gcp/config.sh

say() { printf '\n▶ %s\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }
rand() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-"${1:-40}"; }
secret() { # secret NAME VALUE — creates once; never overwrites or prints
  if exists gcloud secrets describe "$1"; then echo "  secret $1 exists"; return; fi
  printf '%s' "$2" | gcloud secrets create "$1" --replication-policy=user-managed --locations="$REGION" --data-file=- >/dev/null
  echo "  secret $1 created"
}

say "Project $PROJECT_ID ($ENV) in $REGION"
gcloud config set project "$PROJECT_ID" >/dev/null

say "Enabling APIs"
gcloud services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
  storage.googleapis.com sts.googleapis.com

say "Artifact Registry ($REPO)"
exists gcloud artifacts repositories describe "$REPO" --location="$REGION" ||
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --description="Bastaa images"

say "Cloud SQL $SQL_INSTANCE ($SQL_TIER, Postgres 17) — takes several minutes the first time"
if ! exists gcloud sql instances describe "$SQL_INSTANCE"; then
  extra=()
  [ "$ENV" = production ] && extra+=(--enable-point-in-time-recovery --deletion-protection --retained-backups-count=30)
  gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_17 --edition=ENTERPRISE --tier="$SQL_TIER" \
    --region="$REGION" --storage-type=SSD --storage-size=10 --storage-auto-increase --backup-start-time=21:30 ${extra[@]+"${extra[@]}"}
fi
exists gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" || gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"

say "Database passwords (Secret Manager)"
if ! exists gcloud secrets describe db-admin-password; then
  pw=$(rand 32); gcloud sql users set-password postgres --instance="$SQL_INSTANCE" --password="$pw" >/dev/null; secret db-admin-password "$pw"
fi
for role in owner app platform; do secret "db-$role-password" "$(rand 32)"; done
sock="host=/cloudsql/$SQL_CONNECTION"
url() { echo "postgresql://$1:$(gcloud secrets versions access latest --secret="$2")@localhost/$DB_NAME?$sock"; }
secret database-url-admin "$(url postgres db-admin-password)"
secret database-url-owner "$(url schoolos_owner db-owner-password)"
secret database-url-app "$(url schoolos_app db-app-password)"
secret database-url-platform "$(url schoolos_platform db-platform-password)"

say "Application secrets"
if ! exists gcloud secrets describe jwt-private-key; then
  tmp=$(mktemp -d); openssl genpkey -algorithm ed25519 -out "$tmp/k.pem"; openssl pkey -in "$tmp/k.pem" -pubout -out "$tmp/p.pem"
  secret jwt-private-key "$(cat "$tmp/k.pem")"; secret jwt-public-key "$(cat "$tmp/p.pem")"; rm -rf "$tmp"
fi
secret otp-pepper "$(rand 48)"
secret payment-secrets-key "$(openssl rand -base64 32)"
secret bff-shared-secret "$(rand 48)"
secret edge-shared-secret "$(rand 48)"

say "Storage buckets"
exists gcloud storage buckets describe "gs://$BUCKET_PRIVATE" ||
  gcloud storage buckets create "gs://$BUCKET_PRIVATE" --location="$REGION" --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=7d
exists gcloud storage buckets describe "gs://$BUCKET_PUBLIC" ||
  gcloud storage buckets create "gs://$BUCKET_PUBLIC" --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets update "gs://$BUCKET_PRIVATE" --cors-file=infra/gcp/cors.json >/dev/null 2>&1 || true

say "Service accounts (least privilege, docs/10 §2)"
for sa in api web migrate deploy; do
  exists gcloud iam service-accounts describe "schoolos-$sa@$PROJECT_ID.iam.gserviceaccount.com" ||
    gcloud iam service-accounts create "schoolos-$sa" --display-name="Bastaa $sa"
done
bind() { gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$1" --role="$2" --condition=None >/dev/null; }
bind "$SA_API" roles/cloudsql.client
bind "$SA_MIGRATE" roles/cloudsql.client
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET_PRIVATE" --member="serviceAccount:$SA_API" --role=roles/storage.objectAdmin >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET_PUBLIC" --member="serviceAccount:$SA_API" --role=roles/storage.objectAdmin >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET_PUBLIC" --member=allUsers --role=roles/storage.objectViewer >/dev/null
# Signed upload/download links are signed by the API's own service account (no key files).
gcloud iam service-accounts add-iam-policy-binding "$SA_API" --member="serviceAccount:$SA_API" --role=roles/iam.serviceAccountTokenCreator >/dev/null
grant() { gcloud secrets add-iam-policy-binding "$1" --member="serviceAccount:$2" --role=roles/secretmanager.secretAccessor >/dev/null; }
for s in database-url-app database-url-platform jwt-private-key jwt-public-key otp-pepper payment-secrets-key bff-shared-secret edge-shared-secret; do grant "$s" "$SA_API"; done
for s in bff-shared-secret edge-shared-secret; do grant "$s" "$SA_WEB"; done
for s in database-url-owner database-url-admin db-owner-password db-app-password db-platform-password; do grant "$s" "$SA_MIGRATE"; done
# The deployer builds, pushes and deploys, and runs services as the accounts above.
for role in roles/run.admin roles/artifactregistry.writer roles/cloudbuild.builds.editor roles/storage.admin roles/logging.viewer roles/logging.logWriter; do bind "$SA_DEPLOY" "$role"; done
# Cloud Build runs as the deployer too (no default compute account needed).
gcloud iam service-accounts add-iam-policy-binding "$SA_DEPLOY" --member="serviceAccount:$SA_DEPLOY" --role=roles/iam.serviceAccountUser >/dev/null
for sa in "$SA_API" "$SA_WEB" "$SA_MIGRATE"; do
  gcloud iam service-accounts add-iam-policy-binding "$sa" --member="serviceAccount:$SA_DEPLOY" --role=roles/iam.serviceAccountUser >/dev/null
done

if [ -n "$GITHUB_REPO" ]; then
  say "Keyless deploys from GitHub ($GITHUB_REPO) via Workload Identity Federation"
  pool=github; provider=github
  exists gcloud iam workload-identity-pools describe "$pool" --location=global ||
    gcloud iam workload-identity-pools create "$pool" --location=global --display-name="GitHub Actions"
  exists gcloud iam workload-identity-pools providers describe "$provider" --workload-identity-pool="$pool" --location=global ||
    gcloud iam workload-identity-pools providers create-oidc "$provider" --workload-identity-pool="$pool" --location=global \
      --issuer-uri="https://token.actions.githubusercontent.com" \
      --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
      --attribute-condition="assertion.repository == '$GITHUB_REPO'"
  number=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  gcloud iam service-accounts add-iam-policy-binding "$SA_DEPLOY" --role=roles/iam.workloadIdentityUser \
    --member="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$pool/attribute.repository/$GITHUB_REPO" >/dev/null
  up=$(echo "$ENV" | tr '[:lower:]' '[:upper:]')
  echo "  GitHub repository variables to set (Settings → Secrets and variables → Actions → Variables):"
  echo "    GCP_${up}_PROJECT=$PROJECT_ID"
  echo "    GCP_${up}_WIF_PROVIDER=projects/$number/locations/global/workloadIdentityPools/$pool/providers/$provider"
  echo "    GCP_${up}_DEPLOY_SA=$SA_DEPLOY"
fi

cat <<NEXT

✔ Project ready. Next (infra/README.md):
  1. Create database roles:      ENV=$ENV ./infra/gcp/deploy.sh roles
  2. Build, migrate and deploy:  ENV=$ENV ./infra/gcp/deploy.sh
  3. Point Cloudflare at it:     infra/cloudflare (Worker routes for *.$DOMAIN and api.$DOMAIN)
  4. Budget alerts (Billing → Budgets): \$50 / \$80 / \$100 per month (docs/10 §0)
NEXT
