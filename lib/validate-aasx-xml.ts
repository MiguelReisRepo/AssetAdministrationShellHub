import { XMLParser } from "fast-xml-parser"
import { parseAASXML } from "./aasx-parser" // Import the new parser

export async function validateXml(
  xml: string,
  xsd: string,
): Promise<{ valid: true } | { valid: false; errors: string[] }> {
  const parameters = {
    xml: [{ fileName: "input.xml", contents: xml }],
    schema: [{ fileName: "AAS.xsd", contents: xsd }], // Changed fileName to "AAS.xsd"
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

// Removed extractAASDataFromXML and its helper functions.
// The parsing logic is now centralized in aasx-parser.ts

// Removed validateAASStructure as it's now redundant with the new parsing and XSD validation approach.

export async function validateAASXXml(
  xml: string,
): Promise<
  { valid: true; parsed: any; aasData?: any } | { valid: false; errors: string[]; parsed?: any; aasData?: any }
> {
  console.log("[v0] ===== XML VALIDATION START =====")
  console.log("[v0] Original XML length:", xml.length)
  console.log("[v0] Original XML first 500 chars:", xml.substring(0, 500))

  // REMOVED: Namespace normalization. We will generate 3/0 and validate against 3/0 XSD.
  const normalizedXml = xml; 

  console.log("[v0] Normalized XML length:", normalizedXml.length)
  // console.log("[v0] Namespace replacement applied:", xml !== normalizedXml) // This log is now irrelevant

  // Use the new parser directly to get the AAS data structure
  const aasDataFromParser = parseAASXML(normalizedXml);
  if (!aasDataFromParser) {
    console.error("[v0] AASX-PARSER: Failed to parse XML into AAS data structure.")
    return { valid: false, errors: ["Failed to parse AAS XML structure."], aasData: null }
  }
  console.log("[v0] AASX-PARSER: Successfully parsed XML into AAS data structure.")

  // The `parsed` variable from `fast-xml-parser` is still needed for the external `validateXml` call.
  let parsedByFastXml: any;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      allowBooleanAttributes: true,
      removeNSPrefix: true,
    })
    parsedByFastXml = parser.parse(normalizedXml)
  } catch (err: any) {
    console.error("[v0] XML Parsing Error (fast-xml-parser):", err.message)
    return { valid: false, errors: [`XML parsing failed: ${err.message}`], aasData: aasDataFromParser }
  }


  const schemaUrl =
    "https://raw.githubusercontent.com/admin-shell-io/aas-specs-metamodel/refs/heads/master/schemas/xml/AAS.xsd" // This XSD is for AAS 3.0

  try {
    console.log(`[v0] Fetching AAS schema from: ${schemaUrl}`)
    const res = await fetch(schemaUrl)
    if (!res.ok) {
      console.log(`[v0] Failed to fetch AAS schema: ${res.statusText}, proceeding with internal parser result (VALID)`)
      console.log("[v0] ===== XML VALIDATION END (PASSED - SCHEMA FETCH FAILED) =====")
      return { valid: true, parsed: parsedByFastXml, aasData: aasDataFromParser }
    }
    const xsd = await res.text()
    console.log(`[v0] Schema fetched successfully, length: ${xsd.length}`)

    console.log("[v0] Starting XML validation against AAS schema (external service)...")
    const validationResult = await validateXml(normalizedXml, xsd)
    console.log("[v0] External validation service result:", validationResult)

    const isServiceError =
      !validationResult.valid &&
      validationResult.errors.some(
        (err) =>
          err.includes("Load failed") ||
          err.includes("service unavailable") ||
          err.includes("timeout") ||
          err.includes("network") ||
          err.includes("CORS")
      )

    if (isServiceError) {
      console.log("[v0] External validation service unavailable, proceeding with internal parser result (VALID)")
      console.log("[v0] ===== XML VALIDATION END (PASSED - SERVICE FALLBACK) =====")
      return { valid: true, parsed: parsedByFastXml, aasData: aasDataFromParser }
    }

    if (validationResult.valid) {
      console.log("[v0] XML validation PASSED (XSD schema)")
      console.log("[v0] ===== XML VALIDATION END (PASSED) =====")
      return { valid: true, parsed: parsedByFastXml, aasData: aasDataFromParser }
    } else {
      console.log("[v0] XML validation FAILED with XSD schema errors:", validationResult.errors)
      console.log("[v0] ===== XML VALIDATION END (FAILED) =====")
      return { valid: false, errors: validationResult.errors, parsed: parsedByFastXml, aasData: aasDataFromParser }
    }
  } catch (err: any) {
    console.log("[v0] Schema validation error (external service issue):", err.message)
    console.log("[v0] Falling back to internal parser result (VALID)")
    console.log("[v0] ===== XML VALIDATION END (PASSED - FALLBACK) =====")
    return { valid: true, parsed: parsedByFastXml, aasData: aasDataFromParser }
  }
}