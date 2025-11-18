"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { processFile } from "@/lib/process-file" // Import the new processFile function
import type { ValidationResult } from "@/lib/types" // Import ValidationResult type

interface DataUploaderProps {
  onDataUploaded?: (data: ValidationResult) => void
}

export function DataUploader({ onDataUploaded }: DataUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        setIsUploading(true)
        setUploadedFileNames([]) // Clear previous file names
        setUploadProgress(0)
        try {
          for (const file of files) {
            setUploadedFileNames((prev) => [...prev, file.name])
            const results = await processFile(file, setUploadProgress) // Use the new processFile
            results.forEach(result => {
              if (onDataUploaded) {
                onDataUploaded(result)
              }
            })
          }
        } finally {
          setIsUploading(false)
          setUploadProgress(0)
        }
      }
    },
    [onDataUploaded],
  )

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length > 0) {
        setIsUploading(true)
        setUploadedFileNames([]) // Clear previous file names
        setUploadProgress(0)
        try {
          for (const file of files) {
            setUploadedFileNames((prev) => [...prev, file.name])
            const results = await processFile(file, setUploadProgress) // Use the new processFile
            results.forEach(result => {
              if (onDataUploaded) {
                onDataUploaded(result)
              }
            })
          }
        } finally {
          setIsUploading(false)
          setUploadProgress(0)
        }
      }
      e.target.value = ""
    },
    [onDataUploaded],
  )

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-gray-800 border-blue-200 dark:border-gray-700 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Upload Your Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg p-12 text-center transition-all duration-200",
              isDragOver
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500",
              isUploading && "opacity-50 pointer-events-none"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              accept=".aasx,.json,.xml"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />

            <div className="flex flex-col items-center gap-4">
              {isUploading ? (
                <>
                  <div className="p-4 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Processing files... ({uploadProgress}%)
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">Please wait while we parse and validate your files</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                    <Upload className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Drop your data files here
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">or click to browse and select files</p>

                    <div className="flex items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        <span>AASX</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        <span>XML</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        <span>JSON</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {!isUploading && (
              <div className="mt-6 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>Maximum file size: 100MB</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {uploadedFileNames.length > 0 && (
        <Card className="bg-white dark:bg-gray-800 border-green-200 dark:border-gray-700 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              Files Selected ({uploadedFileNames.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadedFileNames.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{file}</span>
                  </div>
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}