const jwt = require('jsonwebtoken');
const axios = require('axios');
const { execSync } = require('child_process');

const privateKey = process.env.APP_PRIVATE_KEY;
const appId = process.env.APP_ID;
const installationId = process.env.APP_INSTALLATION_ID;
const orgName = process.env.ORG_NAME || 'my-org';

const now = Math.floor(Date.now() / 1000);
const payload = {
  iat: now - 60,
  exp: now + (10 * 60),
  iss: appId
};

const jwtToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

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
    console.error("Error obtaining installation token:", error.response ? error.response.data : error);
    process.exit(1);
  }
}

async function downloadAndExtractAppRepo() {
  const installationToken = await getInstallationToken();
  console.log("Installation token obtained.");
  
  const owner = orgName;
  const repo = 'app-repo';
  const ref = 'main';
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`;

  console.log("Downloading tarball from:", tarballUrl);
  try {
    execSync(`curl -L -H "Authorization: token ${installationToken}" -o app-repo.tar.gz "${tarballUrl}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error("Error downloading tarball:", error);
    process.exit(1);
  }

  try {
    execSync('rm -rf temp_app_repo');
    execSync('mkdir temp_app_repo');
    execSync('tar -xzf app-repo.tar.gz -C temp_app_repo --strip-components=1');
    execSync('rm -rf app-code');
    execSync('mv temp_app_repo app-code');
    execSync('rm app-repo.tar.gz');
    console.log("app-repo code extracted into the 'app-code' folder.");
  } catch (error) {
    console.error("Error extracting tarball:", error);
    process.exit(1);
  }
}

downloadAndExtractAppRepo();
