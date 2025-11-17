# Simple Video Compressor

![Logo](build/icon.ico)

A simple, fast, and user-friendly video compressor built with Electron, React, and FFmpeg. Compress your videos with ease—either one at a time or in bulk! The app automatically queues videos based on your CPU core count for efficient parallel processing.

**Note:** This project uses [FFmpeg](https://ffmpeg.org/) for all video compression operations. FFmpeg is a powerful open-source multimedia framework for handling video, audio, and other multimedia files and streams.

## Features

- **Bulk Compression:** Add multiple videos and compress them all at once.
- **Smart Queue:** Compression tasks are queued and processed in parallel, matching your CPU’s capabilities.
- **Single Video Support:** Quickly compress individual videos.
- **Modern UI:** Built with React and Tailwind CSS for a clean, intuitive interface.
- **Cross-platform:** Runs on Windows (installer and portable versions available).

## Getting Started

### Development

To run the app in development mode (Vite + Electron):

```bash
npm install
npm run dev
```

This will start the Vite development server and launch Electron, connecting to `localhost:5173`.

### Building

To build the app for production:

```bash
npm run build
```

This will package the app using Electron Builder.

## Download

You can download the latest releases here:

- [Installer Version](release/Simple%20Video%20Compressor-1.0.0-Setup.exe)
- [Portable Version](release/Simple%20Video%20Compressor-1.0.0-Portable.exe)
