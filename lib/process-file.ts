import type { ValidationResult, ValidationError } from "./types"
import JSZip from "jszip"
import { validateAASXXml } from "./xml-validator"
import { validateAASXJson } from "./json-validator" // Import validateAASXJson
import type { File } from "formdata-node"

// ADD: simple mime resolver by extension
function getMimeTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png": return "image/png"
    case "jpg":
    case "jpeg": return "image/jpeg"
    case "gif": return "image/gif"
    case "bmp": return "image/bmp"
    case "svg": return "image/svg+xml"
    case "pdf": return "application/pdf"
    case "txt": return "text/plain"
    case "csv": return "text/csv"
    case "json": return "application/json"
    case "xml": return "application/xml"
    case "html": return "text/html"
    case "htm": return "text/html"
    case "zip": return "application/zip"
    default: return "application/octet-stream"
  }
}

async function extractThumbnail(zipContent: JSZip): Promise<string | null> {
  try {
    // Look for common thumbnail locations in AASX files
    const thumbnailPaths = [
      "aasx/Thumbnail.png",
      "aasx/thumbnail.png",
      "aasx/Thumbnail.jpg",
      "aasx/thumbnail.jpg",
      "aasx/Thumbnail.jpeg",
      "aasx/thumbnail.jpeg",
      "Thumbnail.png",
      "thumbnail.png",
      "Thumbnail.jpg",
      "thumbnail.jpg",
    ]

    for (const path of thumbnailPaths) {
      const file = zipContent.files[path]
      if (file && !file.dir) {
        console.log(`[v0] Found thumbnail at: ${path}`)
        const imageData = await file.async("base64")
        const extension = path.toLowerCase().split(".").pop()
        const mimeType = extension === "png" ? "image/png" : "image/jpeg"
        return `data:${mimeType};base64,${imageData}`
      }
    }

    // Fallback: look for any image files in the archive
    const imageFiles = Object.keys(zipContent.files).filter(
      (name) => !zipContent.files[name].dir && /\.(png|jpg|jpeg)$/i.test(name),
    )

    if (imageFiles.length > 0) {
      const imagePath = imageFiles[0]
      console.log(`[v0] Found fallback image at: ${imagePath}`)
      const imageData = await zipContent.files[imagePath].async("base64")
      const extension = imagePath.toLowerCase().split(".").pop()
      const mimeType = extension === "png" ? "image/png" : "image/jpeg"
      return `data:${mimeType};base64,${imageData}`
    }

    return null
  } catch (error) {
    console.error("[v0] Error extracting thumbnail:", error)
    return null
  }
}

// AASX file processor with real validation
export async function processFile(file: File, onProgress: (progress: number) => void): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []

  console.log(`[v0] Starting validation for: ${file.name}`)
  onProgress(10)

  try {
    if (file.name.toLowerCase().endsWith(".aasx")) {
      const zip = new JSZip()
      const zipContent = await zip.loadAsync(file)
      onProgress(30)
      const startedAt = Date.now()

      const thumbnail = await extractThumbnail(zipContent)

      // Find candidate XML files in the AASX (exclude system files), we will try to parse to detect AAS
      const allXmlFiles = Object.keys(zipContent.files).filter(
        (name) =>
          name.toLowerCase().endsWith(".xml") &&
          !zipContent.files[name].dir &&
          !name.includes("[Content_Types]") &&
          !name.startsWith("_rels/")
      )

      // Prioritize typical names but accept any .xml
      const score = (n: string) => {
        const s = n.toLowerCase()
        return (s.includes(".aas.xml") ? 3 : 0) + (s.includes("aasenv") ? 2 : 0) + (s.includes("environment") ? 1 : 0)
      }
      const xmlFiles = [...allXmlFiles].sort((a, b) => score(b) - score(a))

      // Find JSON files in the AASX (look for model.json or similar AAS JSON files)
      const jsonFiles = Object.keys(zipContent.files).filter(
        (name) =>
          name.toLowerCase().endsWith(".json") &&
          !zipContent.files[name].dir &&
          (name.includes("model.json") || name.includes("aas") || name.includes("environment")),
      )

      console.log(`[v0] Found ${xmlFiles.length} XML files and ${jsonFiles.length} JSON files`)
      onProgress(50)

      let overallValid = true
      let allErrors: (string | ValidationError)[] = []
      let aasData: any = null
      let parsedContent: any = null
      // ADD: attachments map for AASX embedded files
      const attachments: Record<string, string> = {}

      // Try XML candidates until one parses (valid or invalid) so we at least extract data/errors
      if (xmlFiles.length > 0) {
        let triedAny = false
        for (const candidate of xmlFiles) {
          try {
            const xmlContent = await zipContent.files[candidate].async("text")
            triedAny = true
            const xmlResult = await validateXML(xmlContent, candidate)
            overallValid = overallValid && xmlResult.valid
            if (!xmlResult.valid) {
              allErrors = allErrors.concat(xmlResult.errors || [])
            }
            if (xmlResult.aasData && !aasData) aasData = xmlResult.aasData
            if (xmlResult.parsed && !parsedContent) parsedContent = xmlResult.parsed
            console.log(`[v0] XML validation result for ${candidate}: ${xmlResult.valid}`)
            // Stop after first candidate we tried (we already captured pass/fail)
            break
          } catch (error) {
            console.warn(`[v0] XML candidate failed to load/parse ${candidate}:`, error)
            continue
          }
        }
        if (!triedAny) {
          overallValid = false
          allErrors.push("No AAS XML files found in AASX archive")
        }
      } else {
        overallValid = false
        allErrors.push("No AAS XML files found in AASX archive")
      }

      onProgress(75)

      // Validate the main JSON file (prefer model.json)
      if (jsonFiles.length > 0) {
        const mainJsonFile = jsonFiles.find((f) => f.includes("model.json")) || jsonFiles[0]
        try {
          const jsonContent = await zipContent.files[mainJsonFile].async("text")
          const jsonResult = await validateJSON(jsonContent, file.name)
          
          if (!jsonResult.valid) {
            overallValid = false
            allErrors = allErrors.concat(jsonResult.errors || [])
          }
          // Prefer JSON aasData to preserve element order and metadata from the editor
          if (jsonResult.aasData) aasData = jsonResult.aasData
          if (jsonResult.parsed) parsedContent = jsonResult.parsed

          console.log(`[v0] JSON validation result for ${mainJsonFile}: ${jsonResult.valid}`)
        } catch (error) {
          overallValid = false
          allErrors.push(
            `Failed to validate JSON file ${mainJsonFile}: ${error instanceof Error ? error.message : "Unknown error"}`,
          )
          console.error(`[v0] JSON validation error for ${mainJsonFile}:`, error)
        }
      } else {
        overallValid = false
        allErrors.push("No AAS JSON files found in AASX archive")
      }

      // Build attachments from all non-XML/JSON files in the archive
      for (const name of Object.keys(zipContent.files)) {
        const entry = zipContent.files[name]
        if (!entry || entry.dir) continue
        const lower = name.toLowerCase()
        if (lower.endsWith(".xml") || lower.endsWith(".json")) continue
        const ext = lower.split(".").pop() || ""
        const mime = getMimeTypeFromExt(ext)
        const base64 = await entry.async("base64")
        const dataUrl = `data:${mime};base64,${base64}`
        // Store both normalized and leading-slash variants for easier matching
        attachments[name] = dataUrl
        attachments[`/${name}`] = dataUrl
      }

      // Consolidate AASX results
      const aasxResult: ValidationResult = {
        file: file.name,
        type: "AASX",
        valid: overallValid,
        errors: allErrors.length > 0 ? allErrors : undefined,
        processingTime: Date.now() - startedAt,
        thumbnail: thumbnail || undefined,
        aasData: aasData,
        parsed: parsedContent,
        attachments: Object.keys(attachments).length ? attachments : undefined,
      }
      results.push(aasxResult)

      if (!aasxResult.valid && aasxResult.errors) {
        console.groupCollapsed(`[v0] AASX Validation Errors for ${file.name}`)
        console.table(aasxResult.errors)
        console.groupEnd()
      }

    } else if (file.name.toLowerCase().endsWith(".xml")) {
      const xmlContent = await file.text()
      const xmlResult = await validateXML(xmlContent, file.name)
      results.push(xmlResult)

      if (!xmlResult.valid && xmlResult.errors) {
        console.groupCollapsed(`[v0] XML Validation Errors for ${file.name}`)
        console.table(xmlResult.errors)
        console.groupEnd()
      }

    } else if (file.name.toLowerCase().endsWith(".json")) {
      const jsonContent = await file.text()
      const jsonResult = await validateJSON(jsonContent, file.name)
      results.push(jsonResult)

      if (!jsonResult.valid && jsonResult.errors) {
        console.groupCollapsed(`[v0] JSON Validation Errors for ${file.name}`)
        console.table(jsonResult.errors)
        console.groupEnd()
      }
    }
  } catch (error) {
    console.error(`[v0] File processing error:`, error)
    const errorResult: ValidationResult = {
      file: file.name,
      type: "AASX", // Default to AASX type for general file processing errors
      valid: false,
      errors: [`Failed to process file: ${error instanceof Error ? error.message : "Unknown error"}`],
      processingTime: 0,
    }
    results.push(errorResult)
    console.groupCollapsed(`[v0] General File Processing Error for ${file.name}`)
    console.table(errorResult.errors)
    console.groupEnd()
  }

  onProgress(100)
  console.log(`[v0] Validation completed for ${file.name}. Results:`, results)
  return results
}

async function validateXML(xmlContent: string, fileName: string): Promise<ValidationResult> {
  const startTime = Date.now()

  try {
    console.log(`[v0] Starting comprehensive XML validation for: ${fileName}`)
    const result = await validateAASXXml(xmlContent)

    return {
      file: fileName,
      type: "XML",
      valid: result.valid,
      errors: result.valid ? undefined : result.errors,
      processingTime: Date.now() - startTime,
      parsed: result.parsed,
      aasData: result.aasData,
    }
  } catch (error) {
    console.error(`[v0] XML validation error:`, error)
    return {
      file: fileName,
      type: "XML",
      valid: false,
      errors: [`XML validation failed: ${error instanceof Error ? error.message : "Unknown error"}`],
      processingTime: Date.now() - startTime,
    }
  }
}

async function validateJSON(jsonContent: string, fileName: string): Promise<ValidationResult> {
  const startTime = Date.now()

  try {
    console.log(`[v0] Starting comprehensive JSON validation for: ${fileName}`)
    // Use the comprehensive JSON validation
    const result = await validateAASXJson(jsonContent) // Use validateAASXJson which includes parsing and structure validation

    return {
      file: fileName,
      type: "JSON",
      valid: result.valid,
      errors: result.valid ? undefined : result.errors,
      processingTime: Date.now() - startTime,
      parsed: result.parsed,
      aasData: result.aasData,
    }
  } catch (error) {
    console.error(`[v0] JSON validation error:`, error)
    return {
      file: fileName,
      type: "JSON",
      valid: false,
      errors: [`JSON validation failed: ${error instanceof Error ? error.message : "Invalid JSON format"}`],
      processingTime: Date.now() - startTime,
    }
  }
}