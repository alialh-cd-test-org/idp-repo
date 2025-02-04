const jwt = require('jsonwebtoken');
const axios = require('axios');

// Read secrets from environment variables (available only in idp-repo)
const privateKey = process.env.APP_PRIVATE_KEY;
const appId = process.env.APP_ID;
const installationId = process.env.APP_INSTALLATION_ID;
const orgName = process.env.ORG_NAME || 'alialh-cd-test-org';  // adjust if needed

// Create a JWT valid for 10 minutes
const now = Math.floor(Date.now() / 1000);
const payload = {
  iat: now - 60,           // allow for clock drift
  exp: now + (10 * 60),      // expires in 10 minutes
  iss: appId
};

const jwtToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
console.log("JWT generated.");

// Function to obtain an installation token using the JWT
async function getInstallationToken() {
  try {
    const response = await axios.post(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {},
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    return response.data.token;
  } catch (error) {
    console.error("Error fetching installation token:", error.response ? error.response.data : error);
    process.exit(1);
  }
}

// Function to update (or create) the workflow file in app-repo
async function updateAppRepoWorkflow(installationToken) {
  const owner = orgName;
  const repo = 'app-repo';
  const path = '.github/workflows/trigger-sync.yml';
  const commitMessage = 'Add/update workflow to trigger sync to IDP repo';

  // This is the workflow that will be created in app-repo.
  // It does NOT reference any GitHub App secrets (which are only in idp-repo)
  // Instead, it uses the built-in GITHUB_TOKEN available in app-repo.
  const workflowContent = `name: Trigger Sync to IDP Repo

on:
  push:
    branches:
      - main

jobs:
  trigger-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger repository_dispatch in IDP repo
        run: |
          curl -X POST \\
            -H "Accept: application/vnd.github+json" \\
            -H "Authorization: token \${{ github.token }}" \\
            --data '{"event_type": "sync-code"}' \\
            https://api.github.com/repos/${orgName}/idp-repo/dispatches
`;

  // Base64 encode the file content (as required by the GitHub API)
  const contentBase64 = Buffer.from(workflowContent).toString('base64');

  // Check if the file already exists (to obtain its SHA if it does)
  let sha;
  try {
    const getResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `token ${installationToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    sha = getResponse.data.sha;
  } catch (err) {
    console.log("Workflow file does not exist; it will be created.");
  }

  // Create or update the workflow file in app-repo
  try {
    const putResponse = await axios.put(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        message: commitMessage,
        content: contentBase64,
        sha: sha
      },
      {
        headers: {
          Authorization: `token ${installationToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    console.log("Workflow file created/updated in app-repo:", putResponse.data.content.path);
  } catch (error) {
    console.error("Error updating workflow file in app-repo:", error.response ? error.response.data : error);
    process.exit(1);
  }
}

async function main() {
  const installationToken = await getInstallationToken();
  console.log("Installation token obtained.");
  await updateAppRepoWorkflow(installationToken);
}

main();
