import React, { useEffect, useRef, useState, useCallback } from "react";
import CompressionModal from "./components/CompressionModal";
import AddPanel from "./components/AddPanel";
import VideoItem from "./components/VideoItem";
import DeleteModal from "./components/DeleteModal";
import {
  FiVideo,
  FiSquare,
  FiTrash2,
  FiZap,
  FiFolder,
} from "react-icons/fi";
import type { FileItem } from "../types";

declare global {
  interface Window {
    api: any;
  }
}

export default function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [probedCount, setProbedCount] = useState(0);
  const [probedTotal, setProbedTotal] = useState(0);
  const [modalState, setModalState] = useState<{
    open: boolean;
    file: FileItem | null;
  }>({ open: false, file: null });
  const [deleteModalState, setDeleteModalState] = useState<{
    open: boolean;
    file: FileItem | null;
  }>({ open: false, file: null });
  const [outputFolder, setOutputFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cancelledRef = useRef<Set<string>>(new Set());
  const THROTTLE_MS = 100; // Max UI update frequency
  const SPEED_SAMPLES = 5; // Number of samples for moving average
  // Keep a ref to the latest files state for use in callbacks
  const filesRef = useRef<FileItem[]>(files);

  // Update the ref whenever files changes
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    if (!window.api) return;

    const unsub = window.api.onProgress((_: any, payload: any) => {
      const now = Date.now();

      setFiles((prev) => {
        const idx = prev.findIndex((f) => f.id === payload.id);
        if (idx === -1) return prev;
        const f = prev[idx];

        // Throttle updates (skip if too soon)
        if (f.lastEventAt && now - f.lastEventAt < THROTTLE_MS) {
          return prev;
        }

        const outMs =
          typeof payload.out_time_ms === "number" && !isNaN(payload.out_time_ms)
            ? payload.out_time_ms
            : undefined;

        // Calculate progress percentage
        const progressPercent = computeProgress(f.duration_ms, {
          out_time_ms: outMs,
        });

        // Initialize tracking
        const startedAt = f.startedAt || now;
        let eta_ms = f.eta_ms;
        let speedSamples = f.speedSamples || [];

        // Calculate ETA using speed tracking
        if (
          outMs !== undefined &&
          f.lastOutTimeMs !== undefined &&
          f.lastEventAt !== undefined
        ) {
          const deltaOut = outMs - f.lastOutTimeMs;
          const deltaWall = now - f.lastEventAt;

          if (deltaOut > 0 && deltaWall > 0) {
            const speed = deltaOut / deltaWall; // ms per ms

            // Add to moving average
            speedSamples = [...speedSamples, speed];
            if (speedSamples.length > SPEED_SAMPLES) {
              speedSamples = speedSamples.slice(-SPEED_SAMPLES);
            }

            // Use average speed for stability
            const avgSpeed =
              speedSamples.reduce((a, b) => a + b) / speedSamples.length;
            const remaining = Math.max(0, (f.duration_ms || 0) - outMs);
            eta_ms = Math.round(remaining / avgSpeed);
          }
        }
        else if (
          outMs !== undefined &&
          outMs > 0 &&
          progressPercent &&
          progressPercent > 0
        ) {
          const elapsed = now - startedAt;
          const totalEst = (elapsed * 100) / progressPercent;
          eta_ms = Math.max(0, Math.round(totalEst - elapsed));
        }

        const updated = {
          ...f,
          progress: progressPercent ?? f.progress,
          status: payload.progress || f.status,
          startedAt,
          lastOutTimeMs: outMs,
          lastEventAt: now,
          eta_ms,
          speedSamples,
        };

        if (
          updated.progress === f.progress &&
          updated.eta_ms === f.eta_ms &&
          updated.status === f.status
        ) {
          return prev;
        }
        const newFiles = [...prev];
        newFiles[idx] = updated;
        return newFiles;
      });
    });

    const unsubDone = window.api.onDone(async (_: any, payload: any) => {
      cancelledRef.current.delete(payload.id);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === payload.id
            ? {
                ...f,
                progress: 100,
                status: "done",
                eta_ms: 0,
                outputPath: payload.outputPath,
              }
            : f
        )
      );

      // Use filesRef.current to get the latest files
      const f = filesRef.current.find((file) => file.id === payload.id);

      if (f && payload.outputPath && window.api && window.api.probe) {
        try {
          const info = await window.api.probe(payload.outputPath);
          if (info && info.size !== undefined) {
            setFiles((prev) =>
              prev.map((file) =>
                file.id === payload.id ? { ...file, newSize: info.size } : file
              )
            );
          }
        } catch (e) {
          console.error("Failed to probe output file:", e);
        }
      }
    });

    const unsubErr = window.api.onError((_: any, payload: any) => {
      const id = payload && payload.id;
      if (id && cancelledRef.current.has(id)) {
        cancelledRef.current.delete(id);
        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, status: "stopped" } : f))
        );
      } else {
        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, status: "error" } : f))
        );
      }
    });

    return () => {
      unsub();
      unsubDone();
      unsubErr();
    };
  }, []); // Empty deps - listeners only created once

  function computeProgress(
    duration_ms: number | undefined,
    payload: any
  ): number | undefined {
    if (!duration_ms || duration_ms <= 0) return undefined;
    if (!payload?.out_time_ms) return undefined;
    const outTime = Number(payload.out_time_ms);
    if (isNaN(outTime)) return undefined;
    const clampedTime = Math.max(0, Math.min(outTime, duration_ms));
    return Math.round((clampedTime / duration_ms) * 100);
  }

  function removeAll() {
    for (const f of filesRef.current) {
      if (isCompressingStatus(f.status)) {
        cancelledRef.current.add(f.id);
        if (window.api && window.api.cancelCompression)
          window.api.cancelCompression(f.id);
      }
    }
    setFiles([]);
    cancelledRef.current.clear();
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming: File[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.type.startsWith("video/")) {
        const filePath = (f as any).path || f.name;
        if (!filesRef.current.find((x) => x.path === filePath))
          incoming.push(f);
      }
    }
    if (incoming.length === 0) return;

    setIsLoadingFiles(true);
    setProbedCount(0);
    setProbedTotal(incoming.length);

    const arr: FileItem[] = [];
    for (let i = 0; i < incoming.length; i++) {
      const f = incoming[i];
      const id = `${Date.now()}-${i}`;
      const filePath = (f as any).path || f.name;
      const size = (f as any).size || 0;
      let duration_ms: number | undefined = undefined;
      if (window.api) {
        try {
          const info = await window.api.probe(filePath);
          duration_ms = info.duration_ms;
        } catch (e) {
          console.error("Failed to probe file:", e);
        }
      }
      arr.push({ id, path: filePath, name: f.name, duration_ms, size });
      setProbedCount((prev) => prev + 1);
    }

    setFiles((prev) => [...prev, ...arr]);
    setIsLoadingFiles(false);
  }

  function openFilePicker() {
    if (fileInputRef.current)
      (fileInputRef.current as HTMLInputElement).value = "";
    fileInputRef.current?.click();
  }

  async function selectOutputFolder() {
    if (!window.api) return;
    try {
      const folder = await window.api.selectFolder();
      if (folder) {
        setOutputFolder(folder);
      }
    } catch (e) {
      console.error("Failed to select folder:", e);
    }
  }

  function isCompressingStatus(status?: string | null) {
    return status === "running" || status === "continue";
  }

  function displayStatusLabel(status?: string | null) {
    if (!status) return "queued";
    if (status === "continue") return "compressing";
    return status;
  }

  function openPresetModal(item: FileItem) {
    setModalState({ open: true, file: item });
  }

  function openPresetModalForAll() {
    setModalState({ open: true, file: null });
  }

  function startAllWithPreset(presetKey: string) {
    const list = filesRef.current.filter(
      (f) => !isCompressingStatus(f.status) && f.status !== "done"
    );
    for (const f of list) {
      startCompressionWithPreset(f, presetKey);
    }
  }

  function stopAll() {
    const list = filesRef.current.filter((f) => isCompressingStatus(f.status));
    for (const f of list) {
      stopCompression(f.id);
    }
  }

  function startCompressionWithPreset(item: FileItem, presetKey: string) {
    let out: string;
    if (outputFolder) {
      const fileName = item.name.replace(
        /(\.[^.]*)?$/,
        (m) => `-compressed${m || ".mp4"}`
      );
      out = `${outputFolder}/${fileName}`;
    } else {
      out = item.path.replace(
        /(\.[^.]*)?$/,
        (m) => `-compressed${m || ".mp4"}`
      );
    }

    const presets: Record<string, { reencode: boolean; crf?: number }> = {
      high: { reencode: true, crf: 23 },
      medium: { reencode: true, crf: 28 },
      low: { reencode: true, crf: 32 },
    };

    const p = presets[presetKey] || presets["medium"];

    const payload = {
      id: item.id,
      inputPath: item.path,
      outputPath: out,
      options: { reencode: p.reencode, crf: p.crf },
    };
    setFiles((prev) =>
      prev.map((f) =>
        f.id === item.id ? { ...f, status: "running", outputPath: out } : f
      )
    );
    setModalState({ open: false, file: null });
    window.api.startCompression(payload);
  }

  const removeFile = useCallback((id: string) => {
    const f = filesRef.current.find((x) => x.id === id);
    if (!f) return;
    if (isCompressingStatus(f.status)) {
      cancelledRef.current.add(id);
      if (window.api && window.api.cancelCompression)
        window.api.cancelCompression(id);
    }
    setFiles((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleDeleteAllOriginals = useCallback(() => {
    setDeleteModalState({ open: true, file: null });
  }, []);

  const handleDeleteOriginal = useCallback((file: FileItem) => {
    setDeleteModalState({ open: true, file });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const file = deleteModalState.file;
    if (file) {
      // Delete single file
      try {
        const success = await window.api.deleteFile(file.path);
        if (success) {
          setFiles((prev) => prev.filter((f) => f.id !== file.id));
          setDeleteModalState({ open: false, file: null });
        } else {
          alert(
            "Failed to delete the file. It may be in use or you don't have permission."
          );
        }
      } catch (error) {
        console.error("Error deleting file:", error);
        alert("An error occurred while deleting the file.");
      }
    } else {
      // Delete all done files
      const doneFiles = filesRef.current.filter((f) => f.status === "done");
      let successCount = 0;
      for (const f of doneFiles) {
        try {
          const success = await window.api.deleteFile(f.path);
          if (success) successCount++;
        } catch (error) {
          console.error("Error deleting file:", f.path, error);
        }
      }
      if (successCount === doneFiles.length) {
        setFiles((prev) => prev.filter((f) => f.status !== "done"));
        setDeleteModalState({ open: false, file: null });
      } else {
        alert(`Failed to delete ${doneFiles.length - successCount} file(s).`);
      }
    }
  }, [deleteModalState.file]);

  const stopCompression = useCallback((id: string) => {
    const f = filesRef.current.find((x) => x.id === id);
    if (!f) return;
    cancelledRef.current.add(id);
    if (window.api && window.api.cancelCompression)
      window.api.cancelCompression(id);
    setFiles((prev) =>
      prev.map((x) =>
        x.id === id ? { ...x, status: "stopped", eta_ms: 0 } : x
      )
    );
  }, []);

  function formatBytes(bytes?: number) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatDuration(ms?: number) {
    if (!ms || ms <= 0) return "";
    const s = Math.round(ms / 1000);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (hh > 0)
      return `${hh.toString().padStart(2, "0")}:${mm
        .toString()
        .padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
    return `${mm.toString().padStart(2, "0")}:${ss
      .toString()
      .padStart(2, "0")}`;
  }

  return (
    <>
      <div className="max-w-6xl mx-auto p-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Simple Video Compressor
              </h1>
              <p className="text-gray-600">
                {isLoadingFiles
                  ? `Loading ${probedCount}/${probedTotal} files...`
                  : "Compress your videos with ease • Drag & drop or browse files"}
              </p>
            </div>
            {!isLoadingFiles && files.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={selectOutputFolder}
                  className="inline-flex items-center px-6 py-3 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                  title={
                    outputFolder
                      ? `Output folder: ${outputFolder}`
                      : "Select output folder"
                  }
                >
                  <FiFolder className="w-5 h-5 mr-2" />
                  {outputFolder ? "Change Folder" : "Select Folder"}
                </button>
                <button
                  onClick={openPresetModalForAll}
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <FiZap className="w-5 h-5 mr-2" />
                  Compress All
                </button>
                <button
                  onClick={stopAll}
                  disabled={!files.some((f) => isCompressingStatus(f.status))}
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiSquare className="w-5 h-5 mr-2" />
                  Stop All
                </button>
                {files.filter((f) => f.status === "done").length >= 2 && (
                  <button
                    onClick={handleDeleteAllOriginals}
                    className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <FiTrash2 className="w-5 h-5 mr-2" />
                    Delete All Originals
                  </button>
                )}
                <button
                  onClick={removeAll}
                  disabled={files.some((f) => isCompressingStatus(f.status))}
                  className="inline-flex items-center px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiTrash2 className="w-5 h-5 mr-2" />
                  Clear All
                </button>
              </div>
            )}
          </div>
        </div>

        {files.length === 0 ? (
          isLoadingFiles ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Loading your videos
                </h3>
                <p className="text-gray-600 mb-4">
                  Analyzing file information...
                </p>
                <div className="text-sm text-gray-500">
                  {probedCount}/{probedTotal} processed
                </div>
              </div>
            </div>
          ) : (
            <AddPanel
              title="Add videos to get started"
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
              onFiles={addFiles}
              onClick={openFilePicker}
              inputRef={fileInputRef}
            />
          )
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-3">
              {isLoadingFiles && (
                <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center">
                    <div className="w-5 h-5 border-2 border-amber-400 border-t-amber-600 rounded-full animate-spin mr-3" />
                    <span className="text-sm text-amber-800">
                      Loading new files: {probedCount}/{probedTotal}
                    </span>
                  </div>
                </div>
              )}
              <div className="space-y-6">
                {files.length === 0 && !isLoadingFiles && (
                  <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300">
                    <FiVideo className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      No videos added yet
                    </h3>
                    <p className="text-gray-600">
                      Drop files here or use the panel to add videos
                    </p>
                  </div>
                )}
                {files.map((file) => (
                  <VideoItem
                    key={file.id}
                    file={file}
                    onRemove={removeFile}
                    onStop={stopCompression}
                    onStart={openPresetModal}
                    onDeleteOriginal={handleDeleteOriginal}
                    formatDuration={formatDuration}
                    formatBytes={formatBytes}
                    displayStatusLabel={displayStatusLabel}
                    isCompressingStatus={isCompressingStatus}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <CompressionModal
        open={modalState.open}
        file={modalState.file}
        onClose={() => setModalState({ open: false, file: null })}
        onStart={(presetKey) => {
          if (modalState.file)
            startCompressionWithPreset(modalState.file, presetKey);
          else startAllWithPreset(presetKey);
        }}
      />
      <DeleteModal
        open={deleteModalState.open}
        file={deleteModalState.file}
        onClose={() => setDeleteModalState({ open: false, file: null })}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
