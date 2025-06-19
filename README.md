# ScreenBlink

A desktop application to help prevent dry eyes by reminding you to blink regularly.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up Python environment:
```bash
./setup.sh
```

3. Download the facial landmark model:
```bash
# Create the models directory
mkdir -p electron/assets/models

# Download the model file
curl -L http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2 -o shape_predictor_68_face_landmarks.dat.bz2

# Extract the model file
bunzip2 shape_predictor_68_face_landmarks.dat.bz2

# Move it to the correct location
mv shape_predictor_68_face_landmarks.dat electron/assets/models/
```

4. Start the development server:
```bash
npm run dev
```

## Building

To build the application:

```bash
npm run build
```

The built application will include all necessary files, including the facial landmark model.

## Building Windows Installers

Since you're on macOS, you can use GitHub Actions to build Windows installers:

### Automatic Builds
- **Push to main/develop branches**: Triggers Windows build automatically
- **Create a tag (v* format)**: Triggers full cross-platform build and release

### Manual Builds
1. Go to your GitHub repository
2. Navigate to "Actions" tab
3. Select "Build Windows Installer" workflow
4. Click "Run workflow" button
5. Download the artifacts from the completed run

### Release Workflow
When you create a tag (e.g., `v1.0.0`), the workflow will:
1. Build for all platforms (macOS, Windows, Linux)
2. Create a GitHub release
3. Upload all installers to the release

### Workflow Files
- `.github/workflows/build-windows.yml` - Windows-only builds
- `.github/workflows/build.yml` - Full cross-platform builds and releases

## Features

- Blink detection using computer vision
- Customizable reminder intervals
- Dark mode support
- Keyboard shortcuts
- Eye exercise reminders
- Customizable popup appearance

## Development

The application uses:
- Electron for the desktop application framework
- React for the UI
- Python with dlib for blink detection
- OpenCV for video processing

## License

MIT
