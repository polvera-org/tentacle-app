#!/bin/bash

# Tentacle Release Helper Script
# Usage: ./scripts/release.sh [cli|app] [version]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}================================${NC}"
}

print_step() {
    echo -e "${YELLOW}▶ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Check arguments
if [ $# -ne 2 ]; then
    echo "Usage: $0 [cli|app] [version]"
    echo ""
    echo "Examples:"
    echo "  $0 cli 0.1.0"
    echo "  $0 app 0.1.0"
    exit 1
fi

RELEASE_TYPE=$1
VERSION=$2

# Validate version format (semantic versioning)
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_error "Invalid version format. Use semantic versioning (e.g., 0.1.0)"
    exit 1
fi

# Validate release type
if [[ "$RELEASE_TYPE" != "cli" && "$RELEASE_TYPE" != "app" ]]; then
    print_error "Release type must be 'cli' or 'app'"
    exit 1
fi

print_header "Tentacle Release Script"
echo "Release Type: $RELEASE_TYPE"
echo "Version: $VERSION"
echo ""

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    print_error "You must be on the 'main' branch to create a release"
    echo "Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_error "You have uncommitted changes. Please commit or stash them first."
    git status --short
    exit 1
fi

# Pull latest changes
print_step "Pulling latest changes from origin..."
git pull origin main

# Update version files based on release type
if [ "$RELEASE_TYPE" = "cli" ]; then
    print_step "Updating CLI version in cli/Cargo.toml..."

    # Update Cargo.toml
    sed -i.bak "s/^version = \".*\"/version = \"$VERSION\"/" cli/Cargo.toml
    rm -f cli/Cargo.toml.bak

    # Update lockfile
    print_step "Updating Cargo.lock..."
    cargo update -p tentacle-cli

    TAG_NAME="v$VERSION"
    COMMIT_MSG="Release CLI v$VERSION"

elif [ "$RELEASE_TYPE" = "app" ]; then
    print_step "Updating app version in frontend/src-tauri/tauri.conf.json..."

    # Update tauri.conf.json (using jq if available, otherwise sed)
    if command -v jq &> /dev/null; then
        tmp=$(mktemp)
        jq ".version = \"$VERSION\"" frontend/src-tauri/tauri.conf.json > "$tmp"
        mv "$tmp" frontend/src-tauri/tauri.conf.json
    else
        sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" frontend/src-tauri/tauri.conf.json
        rm -f frontend/src-tauri/tauri.conf.json.bak
    fi

    print_step "Updating app version in frontend/src-tauri/Cargo.toml..."
    sed -i.bak "s/^version = \".*\"/version = \"$VERSION\"/" frontend/src-tauri/Cargo.toml
    rm -f frontend/src-tauri/Cargo.toml.bak

    # Update lockfile
    print_step "Updating Cargo.lock..."
    cargo update -p tentacle-app

    TAG_NAME="app-v$VERSION"
    COMMIT_MSG="Release Desktop App v$VERSION"
fi

# Show changes
print_step "Changes to be committed:"
git diff --stat

echo ""
read -p "Do you want to commit these changes? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Release cancelled"
    exit 1
fi

# Commit changes
print_step "Committing version bump..."
git add .
git commit -m "$COMMIT_MSG"

# Create tag
print_step "Creating git tag: $TAG_NAME..."
git tag -a "$TAG_NAME" -m "$COMMIT_MSG"

print_success "Local changes committed and tagged!"
echo ""
echo "Next steps:"
echo "1. Review the changes: git show HEAD"
echo "2. Push the changes: git push origin main"
echo "3. Push the tag: git push origin $TAG_NAME"
echo ""
echo "Or push everything at once:"
echo "  git push origin main && git push origin $TAG_NAME"
echo ""

read -p "Do you want to push now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_step "Pushing to origin..."
    git push origin main
    git push origin "$TAG_NAME"

    print_success "Release pushed!"
    echo ""
    echo "GitHub Actions will now build the release."
    echo "Monitor progress at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
else
    print_success "Release created locally!"
    echo "Push when ready with: git push origin main && git push origin $TAG_NAME"
fi
