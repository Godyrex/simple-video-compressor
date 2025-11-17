import React from "react";
import { FiVideo, FiX, FiSquare, FiPlay, FiTrash2 } from "react-icons/fi";
import type { FileItem } from "../../types";

interface VideoItemProps {
  file: FileItem;
  onRemove: (id: string) => void;
  onStop: (id: string) => void;
  onStart: (file: FileItem) => void;
  onDeleteOriginal: (file: FileItem) => void;
  formatDuration: (ms?: number) => string;
  formatBytes: (bytes?: number) => string;
  displayStatusLabel: (status?: string) => string;
  isCompressingStatus: (status?: string) => boolean;
}

const VideoItem: React.FC<VideoItemProps> = ({
  file,
  onRemove,
  onStop,
  onStart,
  onDeleteOriginal,
  formatDuration,
  formatBytes,
  displayStatusLabel,
  isCompressingStatus,
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-200">
    <div className="flex items-start justify-between">
      <div className="flex items-start space-x-4 flex-1">
        <div className="w-14 h-10 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center text-blue-600 shadow-sm">
          <FiVideo className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate text-lg">
            {file.name}
          </h3>
          <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
            <span className="flex items-center">
              <span className="w-2 h-2 bg-gray-400 rounded-full mr-2"></span>
              {file.duration_ms
                ? formatDuration(file.duration_ms)
                : "Duration unknown"}
            </span>
            <span>•</span>
            <span>{formatBytes(file.size)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-2 ml-4">
        <button
          onClick={() => onRemove(file.id)}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors duration-200"
          title="Remove file"
        >
          <FiX className="w-5 h-5" />
        </button>
      </div>
    </div>

    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              file.status === "done"
                ? "bg-green-100 text-green-800"
                : file.status === "error"
                ? "bg-red-100 text-red-800"
                : file.status === "running" || file.status === "continue"
                ? "bg-blue-100 text-blue-800"
                : file.status === "stopped"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {displayStatusLabel(file.status)}
          </span>
          {(file.status === "running" || file.status === "continue") &&
            file.progress !== 100 && (
              <span className="text-xs text-gray-500">
                {file.eta_ms && file.eta_ms > 0 ? (
                  <>ETA: {formatDuration(file.eta_ms)}</>
                ) : (
                  <>ETA: Calculating...</>
                )}
              </span>
            )}
        </div>
        <span className="text-sm font-medium text-gray-900">
          {file.progress || 0}%
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ease-out ${
            file.status === "done"
              ? "bg-green-500"
              : file.status === "error"
              ? "bg-red-500"
              : "bg-blue-500"
          }`}
          style={{ width: `${file.progress || 0}%` }}
        />
      </div>
      {file.status === "done" &&
        file.newSize !== undefined &&
        file.size !== undefined &&
        file.size > 0 && (
          <div className="mt-2 text-sm text-gray-600">
            Size: {formatBytes(file.size)} → {formatBytes(file.newSize)} (
            {(((file.size - file.newSize) / file.size) * 100).toFixed(1)}%
            saved)
          </div>
        )}
    </div>

    <div className="mt-4 flex justify-end space-x-2">
      {isCompressingStatus(file.status) ? (
        <button
          onClick={() => onStop(file.id)}
          className="inline-flex items-center px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors duration-200"
        >
          <FiSquare className="w-4 h-4 mr-2" />
          Stop Compression
        </button>
      ) : file.status !== "done" ? (
        <button
          onClick={() => onStart(file)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
        >
          <FiPlay className="w-4 h-4 mr-2" />
          Start Compression
        </button>
      ) : null}
      {file.status === "done" && (
        <button
          onClick={() => onDeleteOriginal(file)}
          className="inline-flex items-center px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors duration-200"
        >
          <FiTrash2 className="w-4 h-4 mr-2" />
          Delete Original
        </button>
      )}
    </div>
  </div>
);

export default VideoItem;
