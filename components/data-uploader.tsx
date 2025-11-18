"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { validateAASXXml } from "@/lib/validate-aasx-xml" // Import the new parser

interface UploadedFile {
  name: string
  content: any
  fileType: "aasx" | "xml" | "json"
  thumbnail?: string
  isValid?: boolean
  validationErrors?: string[]
}

interface DataUploaderProps {
  onDataUploaded?: (data: UploadedFile) => void
}

const parseAASXFile = async (
  file: File,
): Promise<{ content: any; thumbnail: string | null; isValid: boolean; validationErrors: string[] }> => {
  const JSZip = (await import("jszip")).default
  const zip = await JSZip.loadAsync(file)

  let thumbnailDataUrl: string | null = null

  const allFiles = Object.keys(zip.files)
  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"]
  const rootImageFiles = allFiles.filter((name) => {
    const lowerName = name.toLowerCase()
    const isImage = imageExtensions.some((ext) => lowerName.endsWith(ext))
    const isRootLevel = !name.includes("/") || name.split("/").length <= 2
    const notDirectory = !zip.files[name].dir
    return isImage && isRootLevel && notDirectory
  })

  const priorityNames = ["thumbnail", "core", "photo", "preview", "image"]
  const sortedImages = rootImageFiles.sort((a, b) => {
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()
    const aPriority = priorityNames.some((name) => aLower.includes(name))
    const bPriority = priorityNames.some((name) => bLower.includes(name))
    if (aPriority && !bPriority) return -1
    if (!aPriority && bPriority) return 1
    return 0
  })

  if (sortedImages.length > 0) {
    const thumbnailPath = sortedImages[0]
    try {
      const thumbnailBlob = await zip.files[thumbnailPath].async("blob")
      const reader = new FileReader()
      thumbnailDataUrl = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(thumbnailBlob)
      })
    } catch (err) {
      // Silent fail
    }
  }

  const xmlFiles = Object.keys(zip.files).filter((name) => {
    const lowerName = name.toLowerCase()
    return (
      lowerName.endsWith(".xml") &&
      !lowerName.includes(".rels") &&
      !lowerName.includes("[content_types]") &&
      lowerName !== "[content_types].xml" &&
      !zip.files[name].dir
    )
  })

  if (xmlFiles.length === 0) {
    return { content: null, thumbnail: thumbnailDataUrl, isValid: false, validationErrors: ["No XML files found"] }
  }

  let targetFile = xmlFiles.find((f) => f.toLowerCase().endsWith(".aas.xml"))

  if (!targetFile) {
    targetFile = xmlFiles.find((f) => f.includes("aasx/xml/") || f.includes("aasx-origin/"))
  }

  if (!targetFile) {
    targetFile = xmlFiles[0]
  }

  const xmlContent = await zip.files[targetFile].async("text")

  const validationResult = await validateAASXXml(xmlContent)

  console.log(`[v0] Validation result - .valid: ${validationResult.valid}`)

  if (validationResult.valid) {
    return {
      content: validationResult.aasData, // Use aasData directly
      thumbnail: thumbnailDataUrl,
      isValid: true,
      validationErrors: [],
    }
  } else {
    return {
      content: validationResult.aasData, // Use aasData even if validation fails, for partial display
      thumbnail: thumbnailDataUrl,
      isValid: false,
      validationErrors: validationResult.errors || ["Validation failed"],
    }
  }
}

export async function parseAASXFileFromBlob(file: File): Promise<UploadedFile> {
  const { content: parsed, thumbnail, isValid, validationErrors } = await parseAASXFile(file)
  return { 
    name: file.name, 
    content: parsed, 
    fileType: "aasx" as const, 
    thumbnail, 
    isValid, 
    validationErrors 
  }
}

// Removed parseXMLToJSON and parseSubmodelElements from here.
// They are replaced by parseAASXML from lib/aasx-parser.ts

export function DataUploader({ onDataUploaded }: DataUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)

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

  const parseFile = async (file: File): Promise<UploadedFile> => {
    const fileExtension = file.name.split(".").pop()?.toLowerCase()

    if (fileExtension === "json") {
      const text = await file.text()
      try {
        const parsed = JSON.parse(text)
        return {
          name: file.name,
          content: parsed,
          fileType: "json",
          isValid: true,
          validationErrors: [],
        }
      } catch (error: any) {
        console.error("[v0] JSON parsing error:", error)
        return {
          name: file.name,
          content: null,
          fileType: "json",
          isValid: false,
          validationErrors: [`Invalid JSON file: ${error.message}`],
        }
      }
    } else if (fileExtension === "xml") {
      const text = await file.text()
      
      // For XML, we can reuse validateAASXXml for consistent parsing and validation.
      const validationResult = await validateAASXXml(text)

      console.log(`[v0] XML file validation result - .valid: ${validationResult.valid}`)

      return {
        name: file.name,
        content: validationResult.aasData, // Use the AASData from validationResult
        fileType: "xml",
        isValid: validationResult.valid,
        validationErrors: validationResult.valid ? [] : validationResult.errors || ["Validation failed"],
      }
    } else if (fileExtension === "aasx") {
      const { content: parsed, thumbnail, isValid, validationErrors } = await parseAASXFile(file)
      const result = { name: file.name, content: parsed, fileType: "aasx", thumbnail, isValid, validationErrors }
      return result
    }

    return {
      name: file.name,
      content: null,
      fileType: "json",
      isValid: false,
      validationErrors: ["Unsupported file type"],
    }
  }

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        setIsUploading(true)
        try {
          for (const file of files) {
            setUploadedFileNames((prev) => [...prev, file.name])
            const parsedData = await parseFile(file)
            onDataUploaded?.(parsedData)
          }
        } finally {
          setIsUploading(false)
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
        try {
          for (const file of files) {
            setUploadedFileNames((prev) => [...prev, file.name])
            const parsedData = await parseFile(file)
            onDataUploaded?.(parsedData)
          }
        } finally {
          setIsUploading(false)
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
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Processing files...
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">Please wait while we parse your AASX files</p>
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
              Uploaded Files ({uploadedFileNames.length})
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