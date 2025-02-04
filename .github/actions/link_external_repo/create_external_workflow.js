const jwt = require('jsonwebtoken');
const axios = require('axios');

// Read organization-level GitHub App secrets and the external repo name from environment variables.
const {
  APP_PRIVATE_KEY,
  APP_ID,
  APP_INSTALLATION_ID,
  ORG_NAME,
  REPO_NAME
} = process.env;

if (!APP_PRIVATE_KEY || !APP_ID || !APP_INSTALLATION_ID || !ORG_NAME || !REPO_NAME) {
  console.error("Missing required environment variables. Make sure APP_PRIVATE_KEY, APP_ID, APP_INSTALLATION_ID, ORG_NAME, and REPO_NAME are set.");
  process.exit(1);
}

// Create a JWT valid for 10 minutes (with 60 seconds clock drift)
const now = Math.floor(Date.now() / 1000);
const payload = { iat: now - 60, exp: now + 600, iss: APP_ID };
const jwtToken = jwt.sign(payload, APP_PRIVATE_KEY, { algorithm: 'RS256' });
console.log("JWT generated.");

// Function to obtain an installation token from GitHub.
async function getInstallationToken() {
  const url = `https://api.github.com/app/installations/${APP_INSTALLATION_ID}/access_tokens`;
  try {
    const res = await axios.post(url, {}, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    return res.data.token;
  } catch (err) {
    console.error("Error fetching installation token:", err.response ? err.response.data : err);
    process.exit(1);
  }
}

// Function to create or update the workflow file in the external repository.
async function updateExternalRepoWorkflow(installationToken) {
  const owner = ORG_NAME; // Using the organization name as owner.
  const repo = REPO_NAME;
  const path = '.github/workflows/trigger-sync.yml';
  const commitMessage = 'Update trigger workflow for syncing to Mono repo';

  // The workflow content to be created in the external repo.
  // Note: The inline Node.js snippet is wrapped in single quotes.
  // The dispatch call now includes a client_payload with repo_name.
  const workflowContent = `name: Trigger Sync to Mono Repo

on:
  push:
    branches:
      - main

jobs:
  trigger-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '16'
      - name: Install dependencies
        run: npm install jsonwebtoken axios
      - name: Dispatch sync event
        env:
          APP_PRIVATE_KEY: \${{ secrets.APP_PRIVATE_KEY }}
          APP_ID: \${{ secrets.APP_ID }}
          APP_INSTALLATION_ID: \${{ secrets.APP_INSTALLATION_ID }}
          ORG_NAME: \${{ secrets.ORG_NAME }}
        run: |
          node -e 'const jwt = require("jsonwebtoken");
          const axios = require("axios");
          const now = Math.floor(Date.now()/1000);
          const payload = { iat: now-60, exp: now+600, iss: process.env.APP_ID };
          const token = jwt.sign(payload, process.env.APP_PRIVATE_KEY, { algorithm: "RS256" });
          axios.post(\`https://api.github.com/app/installations/\${process.env.APP_INSTALLATION_ID}/access_tokens\`, {}, {
            headers: { Authorization: \`Bearer \${token}\`, Accept: "application/vnd.github.v3+json" }
          }).then(res => {
            const instToken = res.data.token;
            return axios.post(
              \`https://api.github.com/repos/\${process.env.ORG_NAME}/mono-repo/dispatches\`,
              { event_type: "sync-code", client_payload: { repo_name: "${REPO_NAME}" } },
              { headers: { Authorization: \`token \${instToken}\`, Accept: "application/vnd.github.v3+json" } }
            );
          }).then(() => {
            console.log("Sync event dispatched.");
          }).catch(err => {
            console.error("Error dispatching event:", err.response ? err.response.data : err);
            process.exit(1);
          });'
`;

  // Base64-encode the content for the GitHub API.
  const contentBase64 = Buffer.from(workflowContent).toString('base64');

  // Build the API URL for the file in the external repository.
  const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  // Check if the file exists to get its SHA.
  let sha;
  try {
    const res = await axios.get(fileUrl, {
      headers: { Authorization: `token ${installationToken}`, Accept: 'application/vnd.github.v3+json' }
    });
    sha = res.data.sha;
  } catch (err) {
    console.log("Workflow file does not exist; it will be created.");
  }

  // Create or update the file.
  try {
    const res = await axios.put(fileUrl, {
      message: commitMessage,
      content: contentBase64,
      sha: sha
    }, {
      headers: { Authorization: `token ${installationToken}`, Accept: 'application/vnd.github.v3+json' }
    });
    console.log("Workflow file updated in external repo:", res.data.content.path);
  } catch (err) {
    console.error("Error updating workflow file in external repo:", err.response ? err.response.data : err);
    process.exit(1);
  }
}

async function main() {
  const installationToken = await getInstallationToken();
  console.log("Installation token obtained.");
  await updateExternalRepoWorkflow(installationToken);
}

main();
