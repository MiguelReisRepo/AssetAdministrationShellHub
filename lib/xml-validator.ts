import { XMLParser } from "fast-xml-parser"
import type { ValidationResult, ParsedAASData, ValidationError } from "./types"
import { validateAASStructure } from "./json-validator" // Import the structural validator

// External service call for XML schema validation
export async function validateXml(
  xml: string,
  xsd: string,
): Promise<{ valid: true } | { valid: false; errors: string[] }> {
  const parameters = {
    xml: [{ fileName: "input.xml", contents: xml }],
    schema: [{ fileName: "schema.xsd", contents: xsd }],
  }

  try {
    console.log("[v0] Calling XML validation service...")
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch("https://libs.iot-catalogue.com/xmllint-wasm/validateXML", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parameters),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    console.log("[v0] Validation service response status:", response.status)
    console.log("[v0] Validation service response headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      console.error("[v0] Validation service HTTP error:", response.status, response.statusText)
      return { valid: false, errors: [`Validation service error: ${response.status} ${response.statusText}`] }
    }

    const result = await response.json()
    console.log("[v0] Full validation service response:", JSON.stringify(result, null, 2))

    if (result.errors && result.errors.length > 0) {
      const normalizedErrors = result.errors.map((e: any) => (typeof e === "string" ? e : (e.message ?? String(e))))
      console.log("[v0] Validation errors found:", normalizedErrors)
      return { valid: false, errors: normalizedErrors }
    }

    if (result.stderr && result.stderr.length > 0) {
      console.log("[v0] Validation stderr:", result.stderr)
      return { valid: false, errors: Array.isArray(result.stderr) ? result.stderr : [result.stderr] }
    }

    if (result.stdout && result.stdout.includes("error")) {
      console.log("[v0] Validation stdout contains errors:", result.stdout)
      return { valid: false, errors: [result.stdout] }
    }

    if (result.valid === false) {
      console.log("[v0] Validation explicitly marked as false")
      return { valid: false, errors: ["XML validation failed"] }
    }

    if (result.returnCode && result.returnCode !== 0) {
      console.log("[v0] Validation failed with return code:", result.returnCode)
      return { valid: false, errors: [`Validation failed with return code: ${result.returnCode}`] }
    }

    console.log("[v0] XML validation passed - no errors detected")
    return { valid: true }
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error("[v0] XML validation service timeout")
      return { valid: false, errors: ["Validation service timeout"] }
    }
    console.error("[v0] XML validation service error:", error.message)
    return { valid: false, errors: [`Validation service unavailable: ${error.message}`] }
  }
}

const AASX_XSD_URL =
  "https://raw.githubusercontent.com/admin-shell-io/aas-specs-metamodel/refs/heads/master/schemas/xml/AAS.xsd"

export async function validateAASXXml(
  xml: string,
): Promise<
  { valid: true; parsed: any; aasData?: ParsedAASData } | { valid: false; errors: string[]; parsed?: any; aasData?: ParsedAASData }
> {
  console.log("[v0] ===== XML VALIDATION START =====")
  console.log("[v0] Original XML length:", xml.length)
  console.log("[v0] Original XML first 500 chars:", xml.substring(0, 500))

  // IMPORTANT: Replace namespace for compatibility with AAS 3.1 schema
  const normalizedXml = xml.replace(
    /xmlns="https:\/\/admin-shell\.io\/aas\/3\/0"/,
    'xmlns="https://admin-shell.io/aas/3/1"',
  )

  console.log("[v0] Normalized XML length:", normalizedXml.length)
  console.log("[v0] Namespace replacement applied:", xml !== normalizedXml)

  // Parse XML
  let parsed: any
  try {
    console.log("[v0] Starting XML parsing...")
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      allowBooleanAttributes: true,
      removeNSPrefix: true,
    })
    parsed = parser.parse(normalizedXml)
    console.log("[v0] XML parsed successfully")

    if (parsed.environment) {
      console.log("[v0] Found environment wrapper, extracting...")
      parsed = parsed.environment
    }

    console.log("[v0] Parsed XML structure keys:", Object.keys(parsed))
    console.log("[v0] Full parsed structure (first 1000 chars):", JSON.stringify(parsed, null, 2).substring(0, 1000) + "...")
  } catch (err: any) {
    console.error("[v0] XML Parsing Error:", err.message)
    return { valid: false, errors: [`XML parsing failed: ${err.message}`] }
  }

  console.log("[v0] Starting direct AAS structure validation...")
  const structureValidation = validateAASStructure(parsed)
  console.log("[v0] Structure validation result:", structureValidation)

  if (!structureValidation.valid) {
    console.log("[v0] AAS structure validation FAILED with errors:", structureValidation.errors)
    const aasData = extractAASDataFromXML(parsed)
    console.log("[v0] ===== XML VALIDATION END (FAILED) =====")
    return { valid: false, errors: structureValidation.errors.map(e => `${e.path}: ${e.message}`), parsed, aasData }
  }

  console.log("[v0] AAS structure validation PASSED")

  // If structure validation passes, also try external service as backup
  const schemaUrl =
    "https://raw.githubusercontent.com/admin-shell-io/aas-specs-metamodel/refs/heads/master/schemas/xml/AAS.xsd"

  try {
    console.log(`[v0] Fetching AAS schema from: ${schemaUrl}`)
    const res = await fetch(schemaUrl, { mode: 'cors' }) // Ensure CORS is enabled
    if (!res.ok) {
      const errorMsg = `Failed to fetch AAS schema: ${res.status} ${res.statusText}. Cannot perform full schema validation.`
      console.warn(`[v0] ${errorMsg}`)
      const aasData = extractAASDataFromXML(parsed)
      console.log("[v0] ===== XML VALIDATION END (FAILED - SCHEMA FETCH FAILED) =====")
      return { valid: false, errors: [errorMsg], parsed, aasData } // Return false on schema fetch failure
    }
    const xsd = await res.text()
    console.log(`[v0] Schema fetched successfully, length: ${xsd.length}`)

    console.log("[v0] Starting XML validation against AAS schema (external service)...")
    const validationResult = await validateXml(normalizedXml, xsd)
    console.log("[v0] External validation service result:", validationResult)

    if (validationResult.valid) {
      console.log("[v0] XML validation PASSED (both structure and schema)")
      const aasData = extractAASDataFromXML(parsed)
      console.log("[v0] ===== XML VALIDATION END (PASSED) =====")
      return { valid: true, parsed, aasData }
    } else {
      console.log("[v0] XML validation FAILED with errors:", validationResult.errors)
      const aasData = extractAASDataFromXML(parsed)
      console.log("[v0] ===== XML VALIDATION END (FAILED) =====")
      return { valid: false, errors: validationResult.errors, parsed, aasData }
    }
  } catch (err: any) {
    const errorMsg = `Schema validation error (external service issue): ${err.message}. Cannot perform full schema validation.`
    console.error("[v0] " + errorMsg, err) // Log full error object
    console.log("[v0] ===== XML VALIDATION END (FAILED - EXTERNAL SERVICE ERROR) =====")
    return { valid: false, errors: [errorMsg], parsed, aasData } // Return false on external service error
  }
}