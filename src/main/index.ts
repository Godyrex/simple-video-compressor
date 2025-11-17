import {
  app,
  BrowserWindow,
  ipcMain,
  IpcMainInvokeEvent,
  dialog,
  shell,
  Menu,
} from "electron";
import path from "path";
import fs from "fs-extra";
import isDev from "electron-is-dev";
import { FFmpegManager } from "./ffmpeg/manager";
import { QueueManager } from "./queue";
export const CHANNELS = {
  PROBE: "probe",
  COMPRESS_START: "compress:start",
  COMPRESS_PROGRESS: "compress:progress",
  COMPRESS_DONE: "compress:done",
  COMPRESS_ERROR: "compress:error",
  COMPRESS_CANCEL: "compress:cancel",
  SELECT_FOLDER: "select-folder",
  DELETE_FILE: "delete-file",
} as const;

let mainWindow: BrowserWindow | null = null;

// ==================== FFmpeg Path Configuration ====================

function getFfmpegPath(): string {
  console.log("=== FFmpeg Path Configuration ===");
  console.log("Is Packaged:", app.isPackaged);
  console.log("App Path:", app.getAppPath());

  try {
    // Get ffmpeg-static path
    let ffmpegPath: string;

    if (app.isPackaged) {
      // In production, ffmpeg-static is unpacked to app.asar.unpacked
      const unpackedPath = app
        .getAppPath()
        .replace("app.asar", "app.asar.unpacked");
      ffmpegPath = path.join(
        unpackedPath,
        "node_modules",
        "ffmpeg-static",
        "ffmpeg.exe"
      );

      console.log("Looking for ffmpeg at (unpacked):", ffmpegPath);

      if (!fs.existsSync(ffmpegPath)) {
        // Fallback: try direct require (shouldn't work but worth a shot)
        console.log("Not found in unpacked, trying require...");
        ffmpegPath = require("ffmpeg-static");
      }
    } else {
      // Development: use ffmpeg-static directly
      ffmpegPath = require("ffmpeg-static");
      console.log("Development mode - using:", ffmpegPath);
    }

    // Verify it exists
    if (!fs.existsSync(ffmpegPath)) {
      throw new Error(`FFmpeg not found at: ${ffmpegPath}`);
    }

    console.log("✅ FFmpeg found at:", ffmpegPath);
    return ffmpegPath;
  } catch (error) {
    console.error("❌ Failed to load ffmpeg:", error);

    dialog.showErrorBox(
      "FFmpeg Not Found",
      "FFmpeg could not be loaded. Please reinstall the application.\n\n" +
        "Error: " +
        (error instanceof Error ? error.message : String(error))
    );

    throw error;
  }
}

// Get FFmpeg path at startup
let FFMPEG_PATH: string;
try {
  FFMPEG_PATH = getFfmpegPath();
} catch (error) {
  console.error("Failed to initialize FFmpeg:", error);
  app.quit();
  throw error;
}

export { FFMPEG_PATH };

// ==================== Initialize Managers ====================

const ffmpegManager = new FFmpegManager(FFMPEG_PATH);
const queue = new QueueManager(ffmpegManager);

// ==================== Window Creation ====================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });
  Menu.setApplicationMenu(null);
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ==================== App Lifecycle ====================

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ==================== IPC Handlers ====================

ipcMain.handle(
  CHANNELS.PROBE,
  async (event: IpcMainInvokeEvent, filePath: string) => {
    const info = await ffmpegManager.probe(filePath);
    return info;
  }
);

ipcMain.on(CHANNELS.COMPRESS_START, (event, payload) => {
  const webContents = event.sender;
  queue.add(payload, (progress: any) => {
    webContents.send(CHANNELS.COMPRESS_PROGRESS, progress);
    if (progress && progress.done) {
      webContents.send(CHANNELS.COMPRESS_DONE, {
        id: payload.id,
        outputPath: progress.outputPath || payload.outputPath,
      });
    }
    if (progress && progress.error) {
      webContents.send(CHANNELS.COMPRESS_ERROR, {
        id: payload.id,
        message: progress.error,
      });
    }
  });
});

ipcMain.on(CHANNELS.COMPRESS_CANCEL, (event, { id }: { id: string }) => {
  queue.cancel(id);
});

ipcMain.handle(CHANNELS.SELECT_FOLDER, async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
    title: "Select Output Folder for Compressed Videos",
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle(
  CHANNELS.DELETE_FILE,
  async (event: IpcMainInvokeEvent, filePath: string) => {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.warn(`File does not exist: ${filePath}`);
        return false;
      }
      await shell.trashItem(filePath);
      return true;
    } catch (error) {
      console.error("Failed to delete file:", error);
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        try {
          await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
          await shell.trashItem(filePath);
          return true;
        } catch (retryError) {
          console.error("Retry failed to delete file:", retryError);
        }
      }
      return false;
    }
  }
);
