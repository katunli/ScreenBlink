# GitHub Actions Build Workflow

This workflow builds ScreenBlink for macOS, Windows, and Linux platforms.

## Required GitHub Secrets

### For macOS builds (Code signing and notarization):
- `MAC_CERTIFICATE`: Your macOS Developer ID certificate (.p12 file) - base64 encoded
- `MAC_CERTIFICATE_PASSWORD`: Password for the macOS certificate
- `APPLE_ID`: Your Apple ID email address
- `APPLE_ID_PASS`: App-specific password for your Apple ID (not your regular password)
- `APPLE_TEAM_ID`: Your Apple Developer Team ID

### For Windows builds (Code signing):
- `WINDOWS_CERTIFICATE`: Your Windows code signing certificate (.pfx file) - base64 encoded
- `WINDOWS_CERTIFICATE_PASSWORD`: Password for the Windows certificate

## How to set up the secrets:

### macOS Certificate Setup:
1. Export your Developer ID certificate from Keychain Access
2. Convert to base64: `base64 -i certificate.p12 | pbcopy`
3. Paste the base64 string as the `MAC_CERTIFICATE` secret
4. Set the certificate password as `MAC_CERTIFICATE_PASSWORD`
5. Create an app-specific password at https://appleid.apple.com/account/manage
6. Set your Apple ID email as `APPLE_ID`
7. Set the app-specific password as `APPLE_ID_PASS`
8. Find your Team ID in Apple Developer account and set as `APPLE_TEAM_ID`

### Windows Certificate Setup:
1. Export your code signing certificate as .pfx file
2. Convert to base64: `certutil -encode certificate.pfx certificate.b64`
3. Copy the content of certificate.b64 (without headers) as `WINDOWS_CERTIFICATE`
4. Set the certificate password as `WINDOWS_CERTIFICATE_PASSWORD`

## Workflow Features:

- **Triggers**: Runs on push to main/master, pull requests, and when releases are published
- **Platforms**: Builds for macOS (DMG), Windows (EXE), and Linux (AppImage)
- **Artifacts**: Uploads build artifacts that can be downloaded
- **Release Integration**: Automatically creates release assets when a GitHub release is published
- **Caching**: Uses npm cache to speed up builds
- **Python Support**: Installs Python dependencies if requirements.txt exists

## Build Process:

1. **TypeScript Compilation**: Compiles TypeScript to JavaScript
2. **Vite Build**: Builds the React application
3. **Electron Builder**: Packages the app for each platform
4. **Code Signing**: Signs the applications (if certificates provided)
5. **Notarization**: Notarizes macOS builds (if Apple credentials provided)
6. **Artifact Upload**: Uploads the final builds as GitHub artifacts

## Output Artifacts:

- **macOS**: `.dmg` file
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` file

All artifacts are available for download from the GitHub Actions run page. 