const jwt = require('jsonwebtoken');
const axios = require('axios');

// Read secrets from environment variables (these come from your org-level secrets)
const privateKey = process.env.APP_PRIVATE_KEY;
const appId = process.env.APP_ID;
const installationId = process.env.APP_INSTALLATION_ID;
const orgName = process.env.ORG_NAME || 'alialh-cd-test-org';

const now = Math.floor(Date.now() / 1000);
const payload = {
  iat: now - 60,
  exp: now + (10 * 60),
  iss: appId
};

const jwtToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
console.log("JWT generated.");

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

async function updateAppRepoWorkflow(installationToken) {
  const owner = orgName;
  const repo = 'app-repo';
  const path = '.github/workflows/trigger-sync.yml';
  const commitMessage = 'Add/update workflow to trigger sync to IDP repo';

  // This is the workflow file that will be created in app-repo.
  // It uses the organization-level secrets, so app-repo will have access to them.
  const workflowContent = `name: Trigger Sync to IDP Repo

on:
  push:
    branches:
      - main

jobs:
  trigger-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '16'
      - name: Trigger Sync in IDP Repo
        env:
          APP_PRIVATE_KEY: \${{ secrets.APP_PRIVATE_KEY }}
          APP_ID: \${{ secrets.APP_ID }}
          APP_INSTALLATION_ID: \${{ secrets.APP_INSTALLATION_ID }}
          ORG_NAME: \${{ secrets.ORG_NAME }}
        run: |
          node -e "\
          const jwt = require('jsonwebtoken');\
          const axios = require('axios');\
          const now = Math.floor(Date.now()/1000);\
          const payload = { iat: now-60, exp: now+600, iss: process.env.APP_ID };\
          const token = jwt.sign(payload, process.env.APP_PRIVATE_KEY, { algorithm: 'RS256' });\
          axios.post(\`https://api.github.com/app/installations/\${process.env.APP_INSTALLATION_ID}/access_tokens\`, {}, {\
            headers: { Authorization: \`Bearer \${token}\`, Accept: 'application/vnd.github.v3+json' }\
          }).then(res => {\
            const installationToken = res.data.token;\
            return axios.post(\
              \`https://api.github.com/repos/\${process.env.ORG_NAME}/idp-repo/dispatches\`,\
              { event_type: 'sync-code' },\
              { headers: { Authorization: \`token \${installationToken}\`, Accept: 'application/vnd.github.v3+json' } }\
            );\
          }).then(() => {\
            console.log('Dispatch event sent to IDP repo.');\
          }).catch(err => {\
            console.error('Error sending dispatch event:', err.response ? err.response.data : err);\
            process.exit(1);\
          });"
`;

  const contentBase64 = Buffer.from(workflowContent).toString('base64');

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
