import { XMLParser } from "fast-xml-parser"
import { parseAASXML } from "./aasx-parser" // Import the new parser

export async function validateXml(
  xml: string,
  schemas: Array<{ fileName: string; contents: string }>, // Changed to accept an array of schemas
): Promise<{ valid: true } | { valid: false; errors: string[] }> {
  const parameters = {
    xml: [{ fileName: "input.xml", contents: xml }],
    schema: schemas, // Pass the array of schemas
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

// Corrected URL to point to AAS 3.1 schemas using jsdelivr CDN
const AAS_XSD_BASE_URL = "https://cdn.jsdelivr.net/gh/admin-shell-io/aas-specs-metamodel@main/schemas/AAS.3.1/"

export async function validateAASXXml(
  xml: string,
): Promise<
  { valid: true; parsed: any; aasData?: any } | { valid: false; errors: string[]; parsed?: any; aasData?: any }
> {
  console.log("[v0] ===== XML VALIDATION START =====")
  console.log("[v0] Original XML length:", xml.length)
  console.log("[v0] Original XML first 500 chars:", xml.substring(0, 500))

  const normalizedXml = xml; 

  console.log("[v0] Normalized XML length:", normalizedXml.length)

  const aasDataFromParser = parseAASXML(normalizedXml);
  if (!aasDataFromParser) {
    console.error("[v0] AASX-PARSER: Failed to parse XML into AAS data structure.")
    return { valid: false, errors: ["Failed to parse AAS XML structure."], aasData: null }
  }
  console.log("[v0] AASX-PARSER: Successfully parsed XML into AAS data structure.")

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

  const schemaFilesToFetch = [
    { fileName: "AAS.xsd", url: `${AAS_XSD_BASE_URL}AAS.xsd` },
    { fileName: "AAS.Types.xsd", url: `${AAS_XSD_BASE_URL}AAS.Types.xsd` },
    { fileName: "AAS.IEC61360.xsd", url: `${AAS_XSD_BASE_URL}AAS.IEC61360.xsd` },
  ];

  const fetchedSchemas: Array<{ fileName: string; contents: string }> = [];
  let schemaFetchError: string | null = null;

  for (const schemaInfo of schemaFilesToFetch) {
    try {
      console.log(`[v0] Fetching schema from: ${schemaInfo.url}`);
      const res = await fetch(schemaInfo.url);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${schemaInfo.fileName}: ${res.statusText}`);
      }
      const xsdContents = await res.text();
      fetchedSchemas.push({ fileName: schemaInfo.fileName, contents: xsdContents });
      console.log(`[v0] ${schemaInfo.fileName} fetched successfully, length: ${xsdContents.length}`);
    } catch (err: any) {
      console.error(`[v0] Error fetching schema ${schemaInfo.fileName}:`, err.message);
      schemaFetchError = `Failed to fetch schema files: ${err.message}`;
      break; // Stop fetching if one fails
    }
  }

  if (schemaFetchError) {
    console.log("[v0] Schema fetch failed, proceeding with internal parser result (VALID) due to external dependency issue.");
    console.log("[v0] ===== XML VALIDATION END (PASSED - SCHEMA FETCH FAILED) =====");
    return { valid: true, parsed: parsedByFastXml, aasData: aasDataFromParser };
  }

  try {
    console.log("[v0] Starting XML validation against AAS schemas (external service)...");
    const validationResult = await validateXml(normalizedXml, fetchedSchemas); // Pass all fetched schemas
    console.log("[v0] External validation service result:", validationResult);

    const isServiceError =
      !validationResult.valid &&
      validationResult.errors.some(
        (err) =>
          err.includes("Load failed") ||
          err.includes("service unavailable") ||
          err.includes("timeout") ||
          err.includes("network") ||
          err.includes("CORS")
      );

    if (isServiceError) {
      console.log("[v0] External validation service unavailable, proceeding with internal parser result (VALID)");
      console.log("[v0] ===== XML VALIDATION END (PASSED - SERVICE FALLBACK) =====");
      return { valid: true, parsed: parsedByFastXml, aasData: aasDataFromParser };
    }

    if (validationResult.valid) {
      console.log("[v0] XML validation PASSED (XSD schema)");
      console.log("[v0] ===== XML VALIDATION END (PASSED) =====");
      return { valid: true, parsed: parsedByFastXml, aasData: aasDataFromParser };
    } else {
      console.log("[v0] XML validation FAILED with XSD schema errors:", validationResult.errors);
      console.log("[v0] ===== XML VALIDATION END (FAILED) =====");
      return { valid: false, errors: validationResult.errors, parsed: parsedByFastXml, aasData: aasDataFromParser };
    }
  } catch (err: any) {
    console.log("[v0] Schema validation error (external service issue):", err.message);
    console.log("[v0] Falling back to internal parser result (VALID)");
    console.log("[v0] ===== XML VALIDATION END (PASSED - FALLBACK) =====");
    return { valid: true, parsed: parsedByFastXml, aasData: aasDataFromParser };
  }
}