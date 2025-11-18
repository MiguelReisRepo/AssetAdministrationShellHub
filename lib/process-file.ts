import type { ValidationResult } from "./types"
import JSZip from "jszip"
import { validateAASXXml } from "./xml-validator"
import { validateAASXJson } from "./json-validator" // Import validateAASXJson
import type { File } from "formdata-node"

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

      const thumbnail = await extractThumbnail(zipContent)

      // Find XML files in the AASX (exclude system files like [Content_Types].xml)
      const xmlFiles = Object.keys(zipContent.files).filter(
        (name) =>
          name.toLowerCase().endsWith(".xml") &&
          !zipContent.files[name].dir &&
          !name.includes("[Content_Types]") &&
          !name.includes("_rels/") &&
          (name.includes(".aas.xml") || name.includes("aasenv") || name.includes("environment")),
      )

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

      // Validate the main XML file (prefer .aas.xml files)
      if (xmlFiles.length > 0) {
        const mainXmlFile = xmlFiles.find((f) => f.includes(".aas.xml")) || xmlFiles[0]
        try {
          const xmlContent = await zipContent.files[mainXmlFile].async("text")
          const xmlResult = await validateXML(xmlContent, file.name)
          
          if (!xmlResult.valid) {
            overallValid = false
            allErrors = allErrors.concat(xmlResult.errors || [])
          }
          if (xmlResult.aasData) aasData = xmlResult.aasData
          if (xmlResult.parsed) parsedContent = xmlResult.parsed

          console.log(`[v0] XML validation result for ${mainXmlFile}: ${xmlResult.valid}`)
        } catch (error) {
          overallValid = false
          allErrors.push(
            `Failed to validate XML file ${mainXmlFile}: ${error instanceof Error ? error.message : "Unknown error"}`,
          )
          console.error(`[v0] XML validation error for ${mainXmlFile}:`, error)
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
          // Prioritize XML's aasData, but if not available, use JSON's
          if (!aasData && jsonResult.aasData) aasData = jsonResult.aasData
          if (!parsedContent && jsonResult.parsed) parsedContent = jsonResult.parsed

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

      // Consolidate AASX results
      results.push({
        file: file.name,
        type: "AASX",
        valid: overallValid,
        errors: allErrors.length > 0 ? allErrors : undefined,
        processingTime: Date.now() - onProgress(0), // Reset progress for accurate time
        thumbnail: thumbnail || undefined,
        aasData: aasData,
        parsed: parsedContent,
      })

    } else if (file.name.toLowerCase().endsWith(".xml")) {
      const xmlContent = await file.text()
      const xmlResult = await validateXML(xmlContent, file.name)
      results.push(xmlResult)
    } else if (file.name.toLowerCase().endsWith(".json")) {
      const jsonContent = await file.text()
      const jsonResult = await validateJSON(jsonContent, file.name)
      results.push(jsonResult)
    }
  } catch (error) {
    console.error(`[v0] File processing error:`, error)
    results.push({
      file: file.name,
      type: "AASX", // Default to AASX type for general file processing errors
      valid: false,
      errors: [`Failed to process file: ${error instanceof Error ? error.message : "Unknown error"}`],
      processingTime: 0,
    })
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