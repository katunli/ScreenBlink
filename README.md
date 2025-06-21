# ScreenBlink

A desktop application to help prevent dry eyes by reminding you to blink regularly.

## Features

- Blink detection using computer vision
- Customizable reminder intervals
- Dark mode support
- Keyboard shortcuts
- Eye exercise reminders
- Customizable popup appearance
- Efficient background usage

## Development

The application uses:
- Electron for the desktop application framework
- React for the UI
- Python with dlib for blink detection
- OpenCV for video processing

## Installation

Download the latest version the [website](screenblink.vercel.app)

### macOS
If you encounter a "ScreenBlink.app is damaged and can't be opened" error:

You can run this command in Terminal:
```bash
xattr -rd com.apple.quarantine /path/to/ScreenBlink.app
```

This is a common issue with unsigned macOS applications and doesn't indicate that the app is actually damaged.

### Windows
When running the installer or app for the first time, you may see a "Windows protected your PC" warning from SmartScreen. This is normal for unsigned apps.

To proceed:
1. Click **"More info"**
2. Click **"Run anyway"**

This does not mean the app is unsafe; it simply hasn't been code-signed.

## License

MIT
