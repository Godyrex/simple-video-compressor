import React, { useState, useEffect } from 'react'
import { FiX } from 'react-icons/fi'

type FileItem = {
  id: string
  path?: string
  name: string
  duration_ms?: number
  replaceOriginal?: boolean
}

type Props = {
  open: boolean
  file: FileItem | null
  onClose: () => void
  onStart: (presetKey: string) => void
}

export default function CompressionModal({ open, file, onClose, onStart }: Props) {
  const [preset, setPreset] = useState<string>('medium')

  useEffect(() => {
    if (open) setPreset('medium')
  }, [open])

  if (!open) return null
  const title = file ? `Choose compression quality` : `Choose compression quality for all files`
  const subtitle = file
    ? `Pick a preset for ${file.name}. Presets re-encode with different CRF values.`
    : `Pick a preset to apply to all selected files. Presets re-encode with different CRF values.`

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black opacity-50" onClick={onClose} />
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg z-10">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <FiX className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">{subtitle}</p>

        <div className="space-y-3 mb-4">

          <label className="flex items-center space-x-3">
            <input type="radio" name="preset" value="high" checked={preset === 'high'} onChange={() => setPreset('high')} className="form-radio" />
            <div>
              <div className="font-medium">High quality (CRF 23)</div>
              <div className="text-sm text-gray-500">Good quality, larger files</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input type="radio" name="preset" value="medium" checked={preset === 'medium'} onChange={() => setPreset('medium')} className="form-radio" />
            <div>
              <div className="font-medium">Balanced (CRF 28)</div>
              <div className="text-sm text-gray-500">Smaller files with decent quality (default)</div>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input type="radio" name="preset" value="low" checked={preset === 'low'} onChange={() => setPreset('low')} className="form-radio" />
            <div>
              <div className="font-medium">Low quality (CRF 32)</div>
              <div className="text-sm text-gray-500">Smallest files, lower visual quality</div>
            </div>
          </label>
        </div>

        <div className="flex justify-end space-x-3">
          <button className="px-4 py-2 rounded" onClick={onClose}>Cancel</button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded" onClick={() => { onStart(preset) }}>Start</button>
        </div>
      </div>
    </div>
  )
}
