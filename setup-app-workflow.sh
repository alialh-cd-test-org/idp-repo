#!/bin/bash
# Variables – update these with your organization and repository details
APP_REPO="alialh-cd-test-org/app-repo"
WORKFLOW_PATH=".github/workflows/trigger-sync.yml"
COMMIT_MESSAGE="Add workflow to trigger sync to IDP repo"
BRANCH="main"

# Define the content of the workflow file to be created in the app repo
read -r -d '' WORKFLOW_CONTENT <<'EOF'
name: Trigger Sync to IDP Repo

on:
  push:
    branches:
      - main

jobs:
  trigger-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Sync Workflow in IDP Repo
        run: |
          curl -X POST \
            -H "Accept: application/vnd.github+json" \
            -H "Authorization: token ${GITHUB_TOKEN}" \
            --data '{"event_type": "sync-code"}' \
            https://api.github.com/repos/alialh-cd-test-org/idp-repo/dispatches
EOF

# Base64-encode the file content (GitHub API requires base64-encoded file content)
ENCODED_CONTENT=$(echo "$WORKFLOW_CONTENT" | base64 | tr -d '\n')

# Use the GitHub API to create or update the workflow file in the app repo
curl -X PUT \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/${APP_REPO}/contents/${WORKFLOW_PATH} \
  -d @- <<EOF
{
  "message": "${COMMIT_MESSAGE}",
  "content": "${ENCODED_CONTENT}",
  "branch": "${BRANCH}"
}
EOF

echo "Workflow file has been set in the app repo."
