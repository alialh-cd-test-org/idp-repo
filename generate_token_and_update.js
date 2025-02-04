const jwt = require('jsonwebtoken');
const axios = require('axios');

// Get environment variables
const privateKey = process.env.APP_PRIVATE_KEY;
const appId = process.env.APP_ID;
const installationId = process.env.APP_INSTALLATION_ID;
const orgName = process.env.ORG_NAME || 'alialh-cd-test-org'; // Replace with your org name if not passed as a secret

// Create a JWT (expires in 10 minutes)
const now = Math.floor(Date.now() / 1000);
const payload = {
  iat: now - 60, // issued 60 seconds in the past to allow for clock drift
  exp: now + (10 * 60), // expires after 10 minutes
  iss: appId
};

const jwtToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
console.log("JWT generated.");

// Function to get an installation token using the JWT
async function getInstallationToken() {
  try {
    const response = await axios.post(`https://api.github.com/app/installations/${installationId}/access_tokens`, {}, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    return response.data.token;
  } catch (error) {
    console.error("Error fetching installation token:", error.response.data);
    process.exit(1);
  }
}

// Function to update (or create) a file in the app repo
async function updateAppRepoWorkflow(installationToken) {
  // Define details for the target repository (app-repo)
  const owner = orgName;
  const repo = 'app-repo';
  const path = '.github/workflows/trigger-sync.yml';
  const commitMessage = 'Add/update workflow to trigger sync to IDP repo';

  // Define the content of the workflow file to be created in app-repo
  // This workflow will trigger on pushes to app-repo and then call the IDP repo
  const workflowContent = `
name: Trigger Sync to IDP Repo

on:
  push:
    branches:
      - main

jobs:
  trigger-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Sync in IDP Repo
        run: |
          curl -X POST -H "Accept: application/vnd.github+json" \\
          -H "Authorization: token ${installationToken}" \\
          --data '{"event_type": "sync-code"}' \\
          https://api.github.com/repos/${owner}/idp-repo/dispatches
`;
  // Base64 encode the file content
  const contentBase64 = Buffer.from(workflowContent).toString('base64');

  // Check if the file already exists (to get its SHA)
  let sha = null;
  try {
    const getResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: {
        Authorization: `token ${installationToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    sha = getResponse.data.sha;
  } catch (err) {
    console.log("File does not exist; creating a new one.");
  }

  // Create or update the file via the GitHub API
  try {
    const putResponse = await axios.put(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      message: commitMessage,
      content: contentBase64,
      sha: sha
    }, {
      headers: {
        Authorization: `token ${installationToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });
    console.log("Workflow file updated in app repo:", putResponse.data.content.path);
  } catch (error) {
    console.error("Error updating workflow file:", error.response.data);
    process.exit(1);
  }
}

// Main function: Get the installation token and update the file
async function main() {
  const installationToken = await getInstallationToken();
  console.log("Installation token obtained.");
  await updateAppRepoWorkflow(installationToken);
}

main();
