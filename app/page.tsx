"use client"

import { useState } from "react"
import { Upload, Plus, Home as HomeIcon } from 'lucide-react'
import { AASXVisualizer } from "@/components/aasx-visualizer"
import { AASCreator } from "@/components/aas-creator"
import { AASEditor } from "@/components/aas-editor"
import type { ValidationResult } from "@/lib/types" // Import ValidationResult type
import HomeView from "@/components/home-view"
import UploadDialog from "@/components/upload-dialog"

type ViewMode = "home" | "upload" | "visualizer" | "creator" | "editor"

export default function VisualizerPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("home")
  const [uploadedFiles, setUploadedFiles] = useState<ValidationResult[]>([])
  const [newFileIndex, setNewFileIndex] = useState<number | null>(null)
  const [currentAASConfig, setCurrentAASConfig] = useState<any>(null)
  const [initialSubmodelData, setInitialSubmodelData] = useState<Record<string, any> | null>(null)
  const [editorFileIndex, setEditorFileIndex] = useState<number | null>(null)

  const reorderFiles = (fromIndex: number, toIndex: number) => {
    setUploadedFiles((prev) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const handleDataUploaded = (fileData: ValidationResult) => {
    console.log("[v0] Page received file data:", fileData)
    setUploadedFiles((prev) => {
      const newFiles = [...prev, fileData]
      setNewFileIndex(newFiles.length - 1)
      return newFiles
    })
    // After upload, go back to Home as requested
    setViewMode("home")
  }

  const handleProceedToEditor = (config: any) => {
    setCurrentAASConfig(config)
    setViewMode("editor")
   setEditorFileIndex(null)
  }

  const handleFileGenerated = async (fileData: ValidationResult) => {
    console.log("[v0] Generated file received:", fileData)
    
    setUploadedFiles((prev) => {
      const newFiles = [...prev, fileData]
      setNewFileIndex(newFiles.length - 1)
      return newFiles
    })
    
    setViewMode("editor")
    setEditorFileIndex(uploadedFiles.length) // index of newly added file
  }

  // Callback to update AASConfig from AASEditor
  const updateAASConfig = (newConfig: any) => {
    setCurrentAASConfig(newConfig)
  }

  const handleSaveFile = (fileData: ValidationResult) => {
    if (editorFileIndex === null) {
      // No specific file selected, append
      setUploadedFiles((prev) => [...prev, fileData])
      return
    }
    setUploadedFiles((prev) => {
      const next = [...prev]
      const existing = next[editorFileIndex]
      next[editorFileIndex] = {
        ...existing,
        ...fileData,
        file: existing.file || fileData.file,
      }
      return next
    })
  }

  const openVisualizerAt = (index: number) => {
    if (index < 0 || index >= uploadedFiles.length) return
    const file = uploadedFiles[index]
    const env = file.aasData
    if (!env || !Array.isArray(env.assetAdministrationShells) || !env.assetAdministrationShells[0]) {
      return
    }
    const shell = env.assetAdministrationShells[0]
    const submodels = Array.isArray(env.submodels) ? env.submodels : []
    // Build Editor config from existing AAS
    const selectedSubmodels = submodels.map((sm: any) => ({
      idShort: sm.idShort || `Submodel`,
      template: {
        name: sm.idShort || `Submodel`,
        version: "1.0",
        description: "Imported submodel",
        url: sm.semanticId?.keys?.[0]?.value || `https://admin-shell.io/submodels/${sm.idShort || 'submodel'}`
      }
    }))
    const cfg = {
      idShort: shell.idShort || "ImportedAAS",
      id: shell.id || "https://example.com/aas/imported",
      assetKind: shell.assetKind || "Instance",
      globalAssetId: shell.assetInformation?.globalAssetId || "",
      selectedSubmodels
    }
    // Map submodelElements into Editor format
    const mapDescription = (desc: any): string | undefined => {
      if (!desc) return undefined
      if (typeof desc === "string") return desc
      if (Array.isArray(desc)) {
        const en = desc.find((d: any) => d.language === 'en')
        return (en?.text || desc[0]?.text) || undefined
      }
      return undefined
    }
    const mapSemanticId = (sid: any): string | undefined => {
      if (!sid) return undefined
      if (typeof sid === "string") return sid
      const key = sid?.keys?.[0]
      return key?.value || undefined
    }
    const mapCardinality = (el: any): "One" | "ZeroToOne" | "ZeroToMany" | "OneToMany" => {
      const q = Array.isArray(el.qualifiers) ? el.qualifiers.find((x: any) => x?.type === "Cardinality") : null
      const v = q?.value || el.cardinality
      if (v === "One" || v === "ZeroToOne" || v === "ZeroToMany" || v === "OneToMany") return v
      return "ZeroToOne"
    }
    const mapMLPValue = (val: any): Record<string, string> => {
      if (Array.isArray(val)) {
        const out: Record<string, string> = {}
        val.forEach((item: any) => {
          if (item?.language) out[item.language] = item.text || ""
        })
        if (!out.en) out.en = ""
        return out
      }
      if (typeof val === "object" && val) return val
      return { en: "" }
    }
    const mapElement = (el: any): any => {
      const type = el.modelType || "Property"
      const base: any = {
        idShort: el.idShort || "Element",
        modelType: type,
        cardinality: mapCardinality(el),
        description: mapDescription(el.description),
        semanticId: mapSemanticId(el.semanticId),
        preferredName: el.preferredName,
        shortName: el.shortName,
        unit: el.unit,
        dataType: el.dataType,
        category: el.category,
        valueType: el.valueType,
      }
      if (type === "Property") {
        base.value = typeof el.value === "string" ? el.value : ""
      } else if (type === "MultiLanguageProperty") {
        base.value = mapMLPValue(el.value)
      } else if (type === "File") {
        base.value = typeof el.value === "string" ? el.value : ""
        base.fileData = el.fileData
      } else if (type === "SubmodelElementCollection" || type === "SubmodelElementList") {
        const children = Array.isArray(el.value) ? el.value.map(mapElement) : []
        base.children = children
      }
      return base
    }
    const initial: Record<string, any[]> = {}
    submodels.forEach((sm: any) => {
      const elements = Array.isArray(sm.submodelElements) ? sm.submodelElements.map(mapElement) : []
      initial[sm.idShort || "Submodel"] = elements
    })
    setCurrentAASConfig(cfg)
    setInitialSubmodelData(initial)
   setEditorFileIndex(index)
    setViewMode("editor")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border-b border-blue-200 dark:border-gray-700">
        <button
          onClick={() => setViewMode("home")}
          className="flex items-center gap-2"
          aria-label="Go Home"
        >
          <img
            src="https://support.industry.siemens.com/cs/images/109963158/109963158_AssetAdministrationShell_01.png"
            alt="AAS Hub Logo"
            className="w-8 h-8"
          />
          <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            AAS Hub
          </span>
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("home")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              viewMode === "home"
                ? "bg-gray-600 text-white shadow-md"
                : "bg-white/70 text-gray-700 hover:bg-white dark:bg-gray-700 dark:text-gray-200"
            }`}
          >
            <HomeIcon className="w-4 h-4" />
            Home
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
        </div>
      </div>

      {/* Main Content Area */}
      <div className="h-[calc(100vh-73px)]">
        {viewMode === "home" && (
          <HomeView
            files={uploadedFiles}
            onOpen={openVisualizerAt}
            onUploadClick={() => setViewMode("upload")}
            onCreateClick={() => setViewMode("creator")}
            onReorder={reorderFiles}
          />
        )}
        {viewMode === "upload" && (
          <UploadDialog
            onDataUploaded={handleDataUploaded}
            onClose={() => setViewMode("home")}
          />
        )}
        {viewMode === "creator" && (
          <AASCreator
            onProceedToEditor={handleProceedToEditor}
            onClose={() => setViewMode("home")}
          />
        )}
        {viewMode === "editor" && currentAASConfig && (
          <AASEditor 
            aasConfig={currentAASConfig} 
            onBack={() => setViewMode("home")} 
            onFileGenerated={handleFileGenerated}
            onUpdateAASConfig={updateAASConfig}
            initialSubmodelData={initialSubmodelData || undefined}
            onSave={handleSaveFile}
            initialThumbnail={editorFileIndex !== null ? uploadedFiles[editorFileIndex]?.thumbnail || null : null}
          />
        )}
        {/* Visualizer view is no longer reachable from the navbar; kept for internal use if needed */}
      </div>
    </div>
  )
}