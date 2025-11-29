'use client'

import { useState } from 'react'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  isCameraOn: boolean
  isMicOn: boolean
  onToggleCamera: () => void
  onToggleMic: () => void
  onShareScreen: () => void
  onLeaveRoom: () => void
}

export function SettingsPanel({
  isOpen,
  onClose,
  isCameraOn,
  isMicOn,
  onToggleCamera,
  onToggleMic,
  onShareScreen,
  onLeaveRoom,
}: SettingsPanelProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Settings Options */}
        <div className="space-y-4">
          {/* Camera */}
          <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
            <div>
              <p className="font-semibold">Camera</p>
              <p className="text-sm text-gray-400">
                {isCameraOn ? 'Camera is on' : 'Camera is off'}
              </p>
            </div>
            <button
              onClick={onToggleCamera}
              className={`px-4 py-2 rounded-lg transition ${
                isCameraOn
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {isCameraOn ? '📹 On' : '📹 Off'}
            </button>
          </div>

          {/* Microphone */}
          <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
            <div>
              <p className="font-semibold">Microphone</p>
              <p className="text-sm text-gray-400">
                {isMicOn ? 'Microphone is on' : 'Microphone is off'}
              </p>
            </div>
            <button
              onClick={onToggleMic}
              className={`px-4 py-2 rounded-lg transition ${
                isMicOn
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {isMicOn ? '🎤 On' : '🎤 Off'}
            </button>
          </div>

          {/* Screen Share */}
          <button
            onClick={onShareScreen}
            className="w-full bg-gray-700 hover:bg-gray-600 p-4 rounded-lg transition text-left"
          >
            <p className="font-semibold">🖥️ Share Screen</p>
            <p className="text-sm text-gray-400">Share your screen with others</p>
          </button>

          {/* Leave Room */}
          <button
            onClick={onLeaveRoom}
            className="w-full bg-red-600 hover:bg-red-700 p-4 rounded-lg transition"
          >
            <p className="font-semibold">Leave Room</p>
          </button>
        </div>
      </div>
    </div>
  )
}

