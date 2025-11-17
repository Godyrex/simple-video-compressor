import React from "react";
import { FiX, FiTrash2 } from "react-icons/fi";
import type { FileItem } from "../../types";

type Props = {
  open: boolean;
  file: FileItem | null;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DeleteModal({ open, file, onClose, onConfirm }: Props) {
  if (!open) return null;

  const isDeleteAll = !file;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black opacity-50" onClick={onClose} />
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md z-10">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-semibold text-red-600">
            {isDeleteAll ? "Delete All Original Files" : "Delete Original File"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          {isDeleteAll
            ? "Are you sure you want to delete all original files for completed compressions? This action cannot be undone."
            : `Are you sure you want to delete the original file ${file.name}? This action cannot be undone.`}
        </p>
        {!isDeleteAll && (
          <div className="flex items-center space-x-3 mb-4">
            <FiTrash2 className="w-5 h-5 text-red-500" />
            <span className="text-sm text-gray-700">{file.path}</span>
          </div>
        )}
        <div className="flex justify-end space-x-3">
          <button
            className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded flex items-center"
            onClick={onConfirm}
          >
            <FiTrash2 className="w-4 h-4 mr-2" />
            {isDeleteAll ? "Delete All" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
