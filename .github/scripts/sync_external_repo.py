import os
import sys
import subprocess
import json
import requests
from pathlib import Path

def setup_git_config():
    """Configure git with bot credentials"""
    subprocess.run(['git', 'config', 'user.name', 'GitHub Actions Bot'], check=True)
    subprocess.run(['git', 'config', 'user.email', 'actions@github.com'], check=True)

def clone_repo(repo_name, token):
    """Clone a repository using the GitHub token"""
    # Create a clean temporary directory
    temp_dir = f"/tmp/{repo_name}"
    if Path(temp_dir).exists():
        subprocess.run(['rm', '-rf', temp_dir], check=True)
    
    clone_url = f"https://x-access-token:{token}@github.com/{os.environ['GITHUB_REPOSITORY_OWNER']}/{repo_name}.git"
    subprocess.run(['git', 'clone', clone_url, temp_dir], check=True)
    return temp_dir

def sync_to_monorepo(source_path, repo_name):
    """Copy repository contents to monorepo structure"""
    target_path = f"external-repos/{repo_name}"
    Path(target_path).parent.mkdir(exist_ok=True)
    
    # Use rsync to copy files, excluding .git and other unnecessary files
    exclude_patterns = ['.git', '.github', '__pycache__', '*.pyc']
    exclude_args = ' '.join(f'--exclude="{pattern}"' for pattern in exclude_patterns)
    
    subprocess.run(f'rsync -av {exclude_args} {source_path}/ {target_path}/', shell=True, check=True)

def create_pull_request(repo_name, commit_sha, token):
    """Create a pull request with the synced changes"""
    # Create and checkout new branch
    branch_name = f"sync-{repo_name}-{commit_sha[:8]}"
    subprocess.run(['git', 'checkout', '-b', branch_name], check=True)
    
    # Stage and commit changes
    subprocess.run(['git', 'add', '.'], check=True)
    try:
        subprocess.run(['git', 'commit', '-m', f"sync: Update from {repo_name}\n\nSource commit: {commit_sha}"], check=True)
    except subprocess.CalledProcessError:
        print("No changes to commit")
        return
    
    # Push branch
    subprocess.run(['git', 'push', 'origin', branch_name], check=True)
    
    # Create pull request using GitHub REST API
    api_url = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/pulls"
    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github.v3+json'
    }
    data = {
        'title': f"Sync: Update from {repo_name}",
        'body': f"Automated PR to sync changes from {repo_name}\n\nSource commit: {commit_sha}",
        'head': branch_name,
        'base': 'main'
    }
    response = requests.post(api_url, headers=headers, json=data)
    response.raise_for_status()
    print(f"Created PR: {response.json()['html_url']}")

def main():
    """Main execution function"""
    token = os.environ['GITHUB_TOKEN']
    repo_name = os.environ['REPO_NAME']
    commit_sha = os.environ['COMMIT_SHA']
    
    # Setup git configuration
    setup_git_config()
    
    try:
        # Clone the external repository
        temp_dir = clone_repo(repo_name, token)
        
        # Copy contents to monorepo
        sync_to_monorepo(temp_dir, repo_name)
        
        # Create branch and PR
        create_pull_request(repo_name, commit_sha, token)
        
    finally:
        # Cleanup
        if Path(temp_dir).exists():
            subprocess.run(['rm', '-rf', temp_dir], check=True)

if __name__ == "__main__":
    main()