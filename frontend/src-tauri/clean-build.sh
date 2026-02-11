#!/bin/bash
# Clean Tauri build artifacts to free disk space

set -e

echo "🧹 Cleaning Tauri build artifacts..."

# Clean all build artifacts (keeps only release bundle)
cargo clean --release

echo "✓ Cleaned release build artifacts"

# Optional: Remove debug artifacts if they exist
if [ -d "target/debug" ]; then
  rm -rf target/debug
  echo "✓ Removed debug artifacts"
fi

# Show final size
echo ""
echo "📊 Current target folder size:"
du -sh target 2>/dev/null || echo "Target folder does not exist"

echo ""
echo "✓ Cleanup complete!"
