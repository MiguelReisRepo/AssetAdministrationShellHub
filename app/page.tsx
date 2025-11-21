"use client"

import { useState } from "react"
import { Upload, Plus } from 'lucide-react'
import { DataUploader } from "@/components/data-uploader"
import { AASXVisualizer } from "@/components/aasx-visualizer"
import { AASCreator } from "@/components/aas-creator"
import { AASEditor } from "@/components/aas-editor"
import type { ValidationResult } from "@/lib/types" // Import ValidationResult type
import HomeView from "@/components/home-view"

type ViewMode = "home" | "upload" | "visualizer" | "creator" | "editor"

export default function VisualizerPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("home")
  const [uploadedFiles, setUploadedFiles] = useState<ValidationResult[]>([]) // Use ValidationResult type
  const [newFileIndex, setNewFileIndex] = useState<number | null>(null)
  const [currentAASConfig, setCurrentAASConfig] = useState<any>(null) // Renamed from aasConfig

  const handleDataUploaded = (fileData: ValidationResult) => { // Use ValidationResult type
    console.log("[v0] Page received file data:", fileData)
    setUploadedFiles((prev) => {
      const newFiles = [...prev, fileData]
      setNewFileIndex(newFiles.length - 1)
      return newFiles
    })
    setViewMode("visualizer")
  }

  const handleProceedToEditor = (config: any) => {
    // Now receiving assetKind and globalAssetId from AASCreator
    setCurrentAASConfig(config) // Update the new state variable
    setViewMode("editor")
  }

  const handleFileGenerated = async (fileData: ValidationResult) => { // Use ValidationResult type
    console.log("[v0] Generated file received:", fileData)
    
    setUploadedFiles((prev) => {
      const newFiles = [...prev, fileData]
      setNewFileIndex(newFiles.length - 1)
      return newFiles
    })
    
    // Automatically switch to visualizer to show the new file
    setViewMode("visualizer")
  }

  // Callback to update AASConfig from AASEditor
  const updateAASConfig = (newConfig: any) => {
    setCurrentAASConfig(newConfig)
  }

  const openVisualizerAt = (index: number) => {
    if (index >= 0 && index < uploadedFiles.length) {
      setNewFileIndex(index)
      setViewMode("visualizer")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border-b border-blue-200 dark:border-gray-700">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          AASX File Visualizer
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("creator")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              viewMode === "creator"
                ? "bg-green-600 text-white shadow-md"
                : "bg-white/70 text-green-600 hover:bg-white dark:bg-gray-700 dark:text-green-400"
            }`}
          >
            <Plus className="w-4 h-4" />
            Create AAS
          </button>
          <button
            onClick={() => setViewMode("upload")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              viewMode === "upload"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white/70 text-blue-600 hover:bg-white dark:bg-gray-700 dark:text-blue-400"
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload Data
          </button>
          <button
            onClick={() => currentAASConfig && setViewMode("editor")}
            disabled={!currentAASConfig}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              viewMode === "editor"
                ? "bg-yellow-600 text-white shadow-md"
                : currentAASConfig
                  ? "bg-white/70 text-yellow-600 hover:bg-white dark:bg-gray-700 dark:text-yellow-400"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-800"
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => uploadedFiles.length > 0 && setViewMode("visualizer")}
            disabled={uploadedFiles.length === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              viewMode === "visualizer"
                ? "bg-indigo-600 text-white shadow-md"
                : uploadedFiles.length > 0
                  ? "bg-white/70 text-indigo-600 hover:bg-white dark:bg-gray-700 dark:text-indigo-400"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-800"
            }`}
          >
            Visualizer {uploadedFiles.length > 0 && `(${uploadedFiles.length})`}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="h-[calc(100vh-73px)]">
        {viewMode === "home" && (
          <HomeView files={uploadedFiles} onOpen={openVisualizerAt} />
        )}
        {viewMode === "upload" && <DataUploader onDataUploaded={handleDataUploaded} />}
        {viewMode === "creator" && <AASCreator onProceedToEditor={handleProceedToEditor} />}
        {viewMode === "editor" && currentAASConfig && (
          <AASEditor 
            aasConfig={currentAASConfig} 
            onBack={() => setViewMode("creator")} 
            onFileGenerated={handleFileGenerated}
            onUpdateAASConfig={updateAASConfig} // Pass the update callback
          />
        )}
        {viewMode === "visualizer" && uploadedFiles.length > 0 && (
          <AASXVisualizer uploadedFiles={uploadedFiles} newFileIndex={newFileIndex} onFileSelected={() => setNewFileIndex(null)} />
        )}
      </div>
    </div>
  )
}