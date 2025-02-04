name: Sync External Repo Code into IDP Repo

on:
  repository_dispatch:
    types: [sync-code]

jobs:
  sync:
    runs-on: ubuntu-latest
    # Set the external repository name from the event payload.
    env:
      EXTERNAL_REPO: ${{ github.event.client_payload.repo_name }}
    steps:
      - name: Checkout IDP Repo
        uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '16'

      - name: Install dependencies
        run: npm install jsonwebtoken axios

      - name: Download and extract external repo code
        env:
          APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}
          APP_ID: ${{ secrets.APP_ID }}
          APP_INSTALLATION_ID: ${{ secrets.APP_INSTALLATION_ID }}
          ORG_NAME: ${{ secrets.ORG_NAME }}
        run: node download_code.js

      - name: Commit and push changes if any
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if [ -z "$(git status --porcelain)" ]; then
            echo "No changes to commit."
          else
            git add external-code
            git commit -m "Update external code from repository ${{ env.EXTERNAL_REPO }}"
            git push
          fi
