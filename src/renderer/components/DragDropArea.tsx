import React, { useState } from 'react'
import { FiUploadCloud } from 'react-icons/fi'

type Props = {
  onFiles: (files: FileList) => void
  onClick?: () => void
}

export default function DragDropArea({ onFiles, onClick }: Props) {
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      onFiles(e.dataTransfer.files)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
  }

  function handleClick() {
    if (onClick) onClick()
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={`min-h-64 border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-8 transition-all duration-300 cursor-pointer ${
        isDragOver
          ? 'border-blue-500 bg-blue-50 scale-105'
          : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
      }`}
    >
      <div className="text-center">
        <FiUploadCloud
          className={`w-16 h-16 mx-auto mb-4 transition-colors duration-300 ${
            isDragOver ? 'text-blue-500' : 'text-gray-400'
          }`}
        />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">
          {isDragOver ? 'Drop your videos here' : 'Drag & drop videos here'}
        </h3>
        <p className="text-sm text-gray-500">
          or click to browse files
        </p>
        <div className={`mt-4 text-xs text-gray-400 transition-opacity duration-300 ${
          isDragOver ? 'opacity-0' : 'opacity-100'
        }`}>
          Supports MP4, MOV, AVI, and more
        </div>
      </div>
    </div>
  )
}
