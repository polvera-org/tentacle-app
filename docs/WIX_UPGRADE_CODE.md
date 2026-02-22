# WiX Installer Configuration

## Critical Information

**NEVER CHANGE THIS VALUE** - The upgradeCode GUID must remain constant for the lifetime of the application to ensure proper MSI upgrade functionality.

### WiX UpgradeCode GUID
```
C0152CC9-3303-4B8C-A022-FCDB421DA8EF
```

This GUID is configured in `frontend/src-tauri/tauri.conf.json` under `bundle.windows.wix.upgradeCode`.

### What is the upgradeCode?

The upgradeCode is a unique identifier that Windows Installer (MSI) uses to:
- Detect when a new version is being installed over an existing version
- Manage proper upgrade/downgrade behavior
- Ensure only one version of the application is installed at a time
- Link all versions of your application together

### Important Notes

1. **Never regenerate this GUID** - If you change it, Windows will treat new versions as a completely different application
2. **Version updates** - When releasing new versions (0.1.0 → 0.1.1 → 0.2.0), keep this GUID the same
3. **MSI version format** - The `bundle.windows.wix.version` field uses 4-part format (e.g., "0.1.0.0")
4. **Backup** - This GUID is saved in this file for reference in case the config is lost

### Current Configuration

- **Product Name**: Tentacle
- **Identifier**: com.tentacle.desktop
- **Current Version**: 0.1.0
- **MSI Version**: 0.1.0.0
- **Language**: en-US
- **UpgradeCode**: C0152CC9-3303-4B8C-A022-FCDB421DA8EF

### Generated On
- Date: 2026-02-21
- Method: `uuidgen` on macOS
