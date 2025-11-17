"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { validateAASXXml } from "@/lib/validate-aasx-xml"

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
      content: validationResult.aasData || parseXMLToJSON(xmlContent),
      thumbnail: thumbnailDataUrl,
      isValid: true,
      validationErrors: [],
    }
  } else {
    return {
      content: validationResult.aasData || parseXMLToJSON(xmlContent),
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

const parseXMLToJSON = (xmlString: string): any => {
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlString, "text/xml")

    const rootTag = xmlDoc.documentElement.tagName

    if (rootTag.toLowerCase() === "html" || rootTag.toLowerCase() === "parsererror") {
      return null
    }

    const findElements = (tagNames: string[]) => {
      for (const tagName of tagNames) {
        const elements = xmlDoc.getElementsByTagName(tagName)
        if (elements.length > 0) {
          return elements
        }
      }
      return null
    }

    const result: any = {
      idShort: "AAS",
      submodels: [],
    }

    const aasElements = findElements([
      "aas:assetAdministrationShells",
      "assetAdministrationShells",
      "AssetAdministrationShells",
    ])

    const submodelElements = findElements(["aas:submodels", "submodels", "Submodels"])

    if (aasElements && aasElements.length > 0) {
      const aasShells = findElements([
        "aas:assetAdministrationShell",
        "assetAdministrationShell",
        "AssetAdministrationShell",
      ])

      if (aasShells && aasShells.length > 0) {
        const aasElement = aasShells[0]
        const idShortOptions = findElements(["aas:idShort", "idShort", "IdShort"])

        if (idShortOptions && idShortOptions.length > 0) {
          result.idShort = idShortOptions[0].textContent || "AAS"
        }
      }
    }

    if (submodelElements && submodelElements.length > 0) {
      const submodelTags = ["aas:submodel", "submodel", "Submodel"]
      let foundSubmodels: HTMLCollectionOf<Element> | null = null

      for (const tag of submodelTags) {
        const elements = xmlDoc.getElementsByTagName(tag)
        if (elements.length > 0) {
          foundSubmodels = elements
          break
        }
      }

      if (foundSubmodels) {
        for (let i = 0; i < foundSubmodels.length; i++) {
          const sm = foundSubmodels[i]

          let idShort = "Submodel" + i
          const idShortEl = sm.querySelector("idShort, [idShort], aas\\:idShort")
          if (idShortEl) {
            idShort = idShortEl.textContent || idShort
          }

          let id = `http://example.com/sm/${i}`
          const idEl = sm.querySelector("identification, [identification], aas\\:identification")
          if (idEl) {
            const idValue = idEl.textContent || idEl.getAttribute("id")
            if (idValue) id = idValue
          }

          const submodel: any = {
            idShort,
            id,
            submodelElements: [],
          }

          const smElementsContainer = sm.querySelector("submodelElements, aas\\:submodelElements, SubmodelElements")
          if (smElementsContainer) {
            const elements = Array.from(smElementsContainer.children)
            submodel.submodelElements = parseSubmodelElements(elements)
          }

          result.submodels.push(submodel)
        }
      }
    }

    return result
  } catch (error) {
    return null
  }
}

const parseSubmodelElements = (elements: Element[]): any[] => {
  const result: any[] = []

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i]
    const tagName = element.tagName.toLowerCase()

    const idShortEl = element.querySelector("idShort")
    const idShort = idShortEl?.textContent?.trim() || "Unknown"

    const parsedElement: any = { idShort, modelType: tagName }

    if (tagName === "submodelelementcollection") {
      parsedElement.modelType = "SubmodelElementCollection"

      let valueContainer: Element | null = null
      for (let j = 0; j < element.children.length; j++) {
        if (element.children[j].tagName.toLowerCase() === "value") {
          valueContainer = element.children[j]
          break
        }
      }

      if (valueContainer) {
        const childElements = Array.from(valueContainer.children)
        parsedElement.value = parseSubmodelElements(childElements)
      } else {
        parsedElement.value = []
      }
    } else if (tagName === "submodelelementlist") {
      parsedElement.modelType = "SubmodelElementList"

      let valueContainer: Element | null = null
      for (let j = 0; j < element.children.length; j++) {
        if (element.children[j].tagName.toLowerCase() === "value") {
          valueContainer = element.children[j]
          break
        }
      }

      if (valueContainer) {
        const childElements = Array.from(valueContainer.children)
        parsedElement.value = parseSubmodelElements(childElements)
      } else {
        parsedElement.value = []
      }
    } else if (tagName === "property") {
      parsedElement.modelType = "Property"

      const valueTypeEl = element.querySelector("valueType")
      if (valueTypeEl) {
        parsedElement.valueType = valueTypeEl.textContent?.trim()
      }

      let valueEl: Element | null = null
      for (const child of Array.from(element.children)) {
        if (child.tagName.toLowerCase() === "value") {
          valueEl = child
          break
        }
      }
      if (valueEl) {
        parsedElement.value = valueEl.textContent?.trim() || ""
      }

      const categoryEl = element.querySelector("category")
      if (categoryEl) {
        parsedElement.category = categoryEl.textContent?.trim()
      }
    } else if (tagName === "multilanguageproperty") {
      parsedElement.modelType = "MultiLanguageProperty"

      let valueEl: Element | null = null
      for (const child of Array.from(element.children)) {
        if (child.tagName.toLowerCase() === "value") {
          valueEl = child
          break
        }
      }
      if (valueEl) {
        const langStrings = valueEl.querySelectorAll("langStringTextType")
        if (langStrings.length > 0) {
          const values: { [key: string]: string } = {}
          langStrings.forEach((ls) => {
            const lang = ls.querySelector("language")?.textContent?.trim() || "en"
            const text = ls.querySelector("text")?.textContent?.trim() || ""
            values[lang] = text
          })
          parsedElement.value = values
        }
      }
    } else if (tagName === "file") {
      parsedElement.modelType = "File"

      let valueEl: Element | null = null
      for (const child of Array.from(element.children)) {
        if (child.tagName.toLowerCase() === "value") {
          valueEl = child
          break
        }
      }
      if (valueEl) {
        parsedElement.value = valueEl.textContent?.trim() || ""
      }

      const contentTypeEl = element.querySelector("contentType")
      if (contentTypeEl) {
        parsedElement.contentType = contentTypeEl.textContent?.trim()
      }
    } else if (tagName === "basiceventelement") {
      parsedElement.modelType = "BasicEventElement"

      const directionEl = element.querySelector("direction")
      if (directionEl) {
        parsedElement.direction = directionEl.textContent?.trim()
      }

      const stateEl = element.querySelector("state")
      if (stateEl) {
        parsedElement.state = stateEl.textContent?.trim()
      }

      const observedEl = element.querySelector("observed")
      if (observedEl) {
        const keys = observedEl.querySelectorAll("key")
        if (keys.length > 0) {
          parsedElement.observed = {
            keys: Array.from(keys).map((key) => ({
              type: key.querySelector("type")?.textContent?.trim() || "",
              value: key.querySelector("value")?.textContent?.trim() || "",
            })),
          }
        }
      }
    }

    const semanticIdEl = element.querySelector("semanticId")
    if (semanticIdEl) {
      const keys = semanticIdEl.querySelectorAll("key")
      if (keys.length > 0) {
        parsedElement.semanticId = {
          type: semanticIdEl.querySelector("type")?.textContent?.trim() || "ExternalReference",
          keys: Array.from(keys).map((key) => ({
            type: key.querySelector("type")?.textContent?.trim() || "GlobalReference",
            value: key.querySelector("value")?.textContent?.trim() || "",
          })),
        }
      }
    }

    const descriptionEl = element.querySelector("description")
    if (descriptionEl) {
      const langStrings = descriptionEl.querySelectorAll("langStringTextType")
      if (langStrings.length > 0) {
        const values: { [key: string]: string } = {}
        langStrings.forEach((ls) => {
          const lang = ls.querySelector("language")?.textContent?.trim() || "en"
          const text = ls.querySelector("text")?.textContent?.trim() || ""
          values[lang] = text
        })
        parsedElement.description = values
      }
    }

    result.push(parsedElement)
  }

  return result
}

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
      const parsed = JSON.parse(text)
      return {
        name: file.name,
        content: parsed,
        fileType: "json",
        isValid: true,
        validationErrors: [],
      }
    } else if (fileExtension === "xml") {
      const text = await file.text()
      const validationResult = await validateAASXXml(text)

      console.log(`[v0] Validation result - .valid: ${validationResult.valid}`)

      return {
        name: file.name,
        content: validationResult.aasData || parseXMLToJSON(text),
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
