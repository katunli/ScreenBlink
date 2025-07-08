# ScreenBlink

A desktop application to help prevent dry eyes by reminding users to blink regularly.

## Features

- Blink reminders at customizable intervals
- Camera-based blink detection (optional)
- Eye exercise reminders
- Customizable popup appearance and position
- Cross-platform support (Windows, macOS)

## Installation

### Windows
Download the latest release from the [Releases](https://github.com/katunli/ScreenBlink/releases) page.

### macOS
Download the latest release from the [Releases](https://github.com/katunli/ScreenBlink/releases) page.

## Development

### Prerequisites
- Node.js 18+
- Python 3.11+
- Git LFS (for model files)

### Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Setup Python environment: `cd python && ./setup.sh`
4. Build Python binary: `cd python && ./build_and_install.sh`
5. Start development: `npm run dev`

## Testing LFS Cleanup

This commit tests if the LFS cleanup resolved the Windows build issues.
