const jwt = require('jsonwebtoken');
const axios = require('axios');
const { execSync } = require('child_process');

// Read organization-level secrets from environment variables.
const { APP_PRIVATE_KEY, APP_ID, APP_INSTALLATION_ID, ORG_NAME } = process.env;
if (!APP_PRIVATE_KEY || !APP_ID || !APP_INSTALLATION_ID || !ORG_NAME) {
  console.error("Missing required secrets in sync script.");
  process.exit(1);
}

// The external repository name is provided via EXTERNAL_REPO.
const repo = process.env.EXTERNAL_REPO;
if (!repo) {
  console.error("Missing external repository name. Make sure EXTERNAL_REPO is set.");
  process.exit(1);
}

// Create a JWT.
const now = Math.floor(Date.now() / 1000);
const payload = { iat: now - 60, exp: now + 600, iss: APP_ID };
const jwtToken = jwt.sign(payload, APP_PRIVATE_KEY, { algorithm: 'RS256' });

async function getInstallationToken() {
  try {
    const res = await axios.post(
      `https://api.github.com/app/installations/${APP_INSTALLATION_ID}/access_tokens`,
      {},
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    return res.data.token;
  } catch (err) {
    console.error("Error obtaining installation token:", err.response ? err.response.data : err);
    process.exit(1);
  }
}

async function downloadAndExtractExternalRepo() {
  const installationToken = await getInstallationToken();
  console.log("Installation token obtained.");

  const owner = ORG_NAME;
  const ref = 'main';
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`;

  console.log("Downloading tarball from:", tarballUrl);
  try {
    execSync(`curl -L -H "Authorization: token ${installationToken}" -o ${repo}.tar.gz "${tarballUrl}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error("Error downloading tarball:", err);
    process.exit(1);
  }

  try {
    // Remove any previous extraction and extract the tarball.
    execSync(`rm -rf temp_${repo}`);
    execSync(`mkdir temp_${repo}`);
    execSync(`tar -xzf ${repo}.tar.gz -C temp_${repo} --strip-components=1`);
    // Remove any previous external-code folder and rename the extracted folder.
    execSync(`rm -rf ${repo}`);
    execSync(`mv temp_${repo} ${repo}`);
    execSync(`rm ${repo}.tar.gz`);
    console.log(`Repository ${repo} code extracted into the '${repo}' folder.`);
  } catch (err) {
    console.error("Error extracting tarball:", err);
    process.exit(1);
  }
}

downloadAndExtractExternalRepo();
