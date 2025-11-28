import { XMLParser } from "fast-xml-parser"
import type { ValidationResult, ParsedAASData, ValidationError } from "./types"

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
      // DEDUP: collapse whitespace and deduplicate identical messages
      const uniqueErrors = Array.from(new Set(normalizedErrors.map((m) => m.replace(/\s+/g, " ").trim())))
      console.log("[v0] Validation errors found:", uniqueErrors)
      return { valid: false, errors: uniqueErrors }
    }

    if (result.stderr && result.stderr.length > 0) {
      const stderrArr = Array.isArray(result.stderr) ? result.stderr : [result.stderr]
      const uniqueErrors = Array.from(new Set(stderrArr.map((m) => String(m).replace(/\s+/g, " ").trim())))
      console.log("[v0] Validation stderr:", uniqueErrors)
      return { valid: false, errors: uniqueErrors }
    }

    if (result.stdout && result.stdout.includes("error")) {
      const msg = String(result.stdout).replace(/\s+/g, " ").trim()
      console.log("[v0] Validation stdout contains errors:", msg)
      return { valid: false, errors: [msg] }
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

// Helper functions for XML parsing and data extraction
function extractSubmodelRefs(submodels: any): string[] {
  if (!submodels) return []

  const refs = submodels.reference || submodels
  const refArray = Array.isArray(refs) ? refs : [refs]

  return refArray
    .map((ref: any) => {
      if (ref.keys?.key) {
        const keys = Array.isArray(ref.keys.key) ? ref.keys.key : [ref.keys.key]
        return keys.find((k: any) => k.type === "Submodel")?.value
      }
      return null
    })
    .filter(Boolean)
}

function parseXMLSubmodelElements(elementsContainer: any): any[] {
  if (!elementsContainer) return []

  const elements: any[] = []

  // AAS 1.0 shape: submodelElements.submodelElement[] where each entry contains exactly one typed object
  const smEl = (elementsContainer as any).submodelElement
  if (smEl) {
    const entries = Array.isArray(smEl) ? smEl : [smEl]
    const elementTypes = [
      "property",
      "multiLanguageProperty",
      "file",
      "blob",
      "range",
      "submodelElementCollection",
      "submodelElementList",
      "referenceElement",
      "basicEventElement",
      "operation",
      "capability",
      "entity",
    ]
    entries.forEach((entry: any) => {
      if (!entry || typeof entry !== "object") return
      elementTypes.forEach((type) => {
        if (entry[type]) {
          const typeEntries = Array.isArray(entry[type]) ? entry[type] : [entry[type]]
          typeEntries.forEach((el: any) => {
            const parsed = parseXMLElement(el, type)
            if (parsed) elements.push(parsed)
          })
        }
      })
    })
    return elements
  }

  // AAS 3.x shape: container has arrays per type
  const elementTypes = [
    "property",
    "multiLanguageProperty",
    "file",
    "blob",
    "range",
    "submodelElementCollection",
    "submodelElementList",
    "referenceElement",
    "basicEventElement",
    "operation",
    "capability",
    "entity",
  ]

  elementTypes.forEach((type) => {
    if ((elementsContainer as any)[type]) {
      const typeElements = Array.isArray((elementsContainer as any)[type])
        ? (elementsContainer as any)[type]
        : [(elementsContainer as any)[type]]

      typeElements.forEach((element: any) => {
        const parsed = parseXMLElement(element, type)
        if (parsed) elements.push(parsed)
      })
    }
  })

  return elements
}

function parseXMLElement(element: any, type: string): any {
  if (!element) return null

  const base = {
    idShort: element.idShort || element["@_idShort"] || "Unknown",
    modelType: getModelTypeFromXMLType(type),
    category: element.category,
    description: parseXMLDescription(element.description),
    semanticId: element.semanticId,
    qualifiers: element.qualifiers || element.qualifier || [],
    embeddedDataSpecifications: element.embeddedDataSpecifications || [],
  }

  switch (type) {
    case "property": {
      // Value may be a plain string, or { "#text": "..." } in AAS 1.0
      const valNode = element.value
      const val =
        typeof valNode === "object" && valNode !== null && "#text" in valNode ? valNode["#text"] : valNode
      return {
        ...base,
        valueType: element.valueType || element.valueTypeListElement,
        value: val,
      }
    }

    case "multiLanguageProperty":
      return {
        ...base,
        value: parseXMLLangStringArray(element.value || element),
      }

    case "file":
      return {
        ...base,
        value: element.value,
        contentType: element.contentType,
      }

    case "submodelElementCollection": {
      // In AAS 1.0, nested elements live under value.submodelElement[]
      const inner = element.value && element.value.submodelElement ? element.value : (element.value || {})
      return {
        ...base,
        value: parseXMLSubmodelElements(inner),
      }
    }

    case "submodelElementList":
      return {
        ...base,
        typeValueListElement: element.typeValueListElement,
        value: parseXMLSubmodelElements(element.value || {}),
      }

    case "basicEventElement":
      return {
        ...base,
        observed: element.observed,
        direction: element.direction,
        state: element.state,
      }

    case "range":
      return {
        ...base,
        valueType: element.valueType,
        min: element.min,
        max: element.max,
      }

    case "blob":
      return {
        ...base,
        value: element.value,
        contentType: element.contentType,
      }

    case "referenceElement":
      return {
        ...base,
        value: element.value,
      }

    default:
      return {
        ...base,
        ...element,
      }
  }
}

function getModelTypeFromXMLType(xmlType: string): string {
  const typeMap: { [key: string]: string } = {
    property: "Property",
    multiLanguageProperty: "MultiLanguageProperty",
    file: "File",
    blob: "Blob",
    range: "Range",
    submodelElementCollection: "SubmodelElementCollection",
    submodelElementList: "SubmodelElementList",
    referenceElement: "ReferenceElement",
    basicEventElement: "BasicEventElement",
    operation: "Operation",
    capability: "Capability",
    entity: "Entity",
  }
  return typeMap[xmlType] || "Unknown"
}

function parseXMLDescription(description: any): any[] {
  if (!description) return []

  if (description.langStringTextType) {
    const langStrings = Array.isArray(description.langStringTextType)
      ? description.langStringTextType
      : [description.langStringTextType]

    return langStrings.map((ls: any) => ({
      language: ls.language || ls["@_language"] || ls["@_lang"] || "en",
      text: ls.text || ls["#text"] || "",
    }))
  }

  // AAS 1.0 compatibility: sometimes uses 'langString'
  if (description.langString) {
    const langStrings = Array.isArray(description.langString) ? description.langString : [description.langString]
    return langStrings.map((ls: any) => ({
      language: ls.language || ls["@_language"] || ls["@_lang"] || "en",
      text: ls.text || ls["#text"] || "",
    }))
  }

  return []
}

function parseXMLLangStringArray(value: any): any[] {
  if (!value) return []

  if (value.langStringTextType) {
    const langStrings = Array.isArray(value.langStringTextType) ? value.langStringTextType : [value.langStringTextType]

    return langStrings.map((ls: any) => ({
      language: ls.language || ls["@_language"] || ls["@_lang"] || "en",
      text: ls.text || ls["#text"] || "",
    }))
  }

  // AAS 1.0 compatibility: 'langString'
  if (value.langString) {
    const langStrings = Array.isArray(value.langString) ? value.langString : [value.langString]
    return langStrings.map((ls: any) => ({
      language: ls.language || ls["@_language"] || ls["@_lang"] || "en",
      text: ls.text || ls["#text"] || "",
    }))
  }

  return []
}

export function extractAASDataFromXML(parsed: any): ParsedAASData | null {
  if (!parsed) return null

  try {
    // Handle different XML structures
    let aasData = parsed
    if (parsed.environment) {
      aasData = parsed.environment
    } else if ((parsed as any).aasenv) {
      // NEW: unwrap legacy AAS 1.0 wrapper
      aasData = (parsed as any).aasenv
    }

    const result: ParsedAASData = {
      assetAdministrationShells: [],
      submodels: [],
      rawData: aasData,
    }

    // Extract Asset Administration Shells
    if (aasData.assetAdministrationShells) {
      const shellsContainer = aasData.assetAdministrationShells
      const shells = shellsContainer.assetAdministrationShell
        ? Array.isArray(shellsContainer.assetAdministrationShell)
          ? shellsContainer.assetAdministrationShell
          : [shellsContainer.assetAdministrationShell]
        : []

      result.assetAdministrationShells = shells.map((shell: any) => ({
        id: shell.id || shell["@_id"] || (shell.identification?.["#text"] || shell.identification) || "Unknown ID",
        idShort: shell.idShort || shell["@_idShort"] || "Unknown",
        assetKind: (shell.assetInformation?.assetKind) || shell.assetKind || "Unknown",
        assetInformation: shell.assetInformation || {},
        description: shell.description || [],
        administration: shell.administration || {},
        derivedFrom: shell.derivedFrom || null,
        embeddedDataSpecifications: shell.embeddedDataSpecifications || [],
        submodelRefs: extractSubmodelRefs(shell.submodels || shell.submodelRefs || shell.submodelRef),
        rawData: shell,
      }))
    }

    // Extract Submodels
    if (aasData.submodels) {
      const submodelsContainer = aasData.submodels
      const submodels = submodelsContainer.submodel
        ? Array.isArray(submodelsContainer.submodel)
          ? submodelsContainer.submodel
          : [submodelsContainer.submodel]
        : []

      result.submodels = submodels.map((submodel: any) => ({
        id: submodel.id || submodel["@_id"] || "Unknown ID",
        idShort: submodel.idShort || submodel["@_idShort"] || "Unknown",
        kind: submodel.kind || "Unknown",
        description: submodel.description || [],
        administration: submodel.administration || {},
        semanticId: submodel.semanticId || null,
        qualifiers: submodel.qualifiers || [],
        embeddedDataSpecifications: submodel.embeddedDataSpecifications || [],
        submodelElements: parseXMLSubmodelElements(submodel.submodelElements),
        rawData: submodel,
      }))
    }

    return result
  } catch (error) {
    console.error("Error extracting AAS data from XML:", error)
    return null
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

  // Detect declared AAS namespace version (1.0 vs 3.0 vs 3.1)
  const isLegacy10 = /http:\/\/www\.admin-shell\.io\/aas\/1\/0/i.test(xml) || /<aas:aasenv/i.test(xml)
  const nsMatch = xml.match(/xmlns="https:\/\/admin-shell\.io\/aas\/(\d+)\/(\d+)"/i)
  const declaredMajor = nsMatch ? nsMatch[1] : null
  const declaredMinor = nsMatch ? nsMatch[2] : null
  const declaredVersion = declaredMajor && declaredMinor ? `${declaredMajor}.${declaredMinor}` : (isLegacy10 ? "1.0" : null)
  const is31 = declaredVersion === "3.1"
  const is30 = declaredVersion === "3.0"

  console.log("[v0] Detected AAS XML namespace version:", declaredVersion || "unknown")

  const originalXml = xml

  // For 3.0, we still optionally upgrade the string for a compatibility check
  const upgradedTo31Xml = is30
    ? originalXml.replace(/xmlns="https:\/\/admin-shell\.io\/aas\/3\/0"/i, 'xmlns="https://admin-shell.io/aas/3/1"')
    : originalXml

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
    parsed = parser.parse(originalXml)
    console.log("[v0] XML parsed successfully")

    if (parsed.environment) {
      console.log("[v0] Found environment wrapper, extracting...")
      parsed = parsed.environment
    } else if ((parsed as any).aasenv) {
      console.log("[v0] Found legacy AAS 1.0 wrapper (aasenv), extracting...")
      parsed = (parsed as any).aasenv
    }

    console.log("[v0] Parsed XML structure keys:", Object.keys(parsed))
    console.log("[v0] Full parsed structure (first 1000 chars):", JSON.stringify(parsed, null, 2).substring(0, 1000) + "...")
  } catch (err: any) {
    console.error("[v0] XML Parsing Error:", err.message)
    return { valid: false, errors: [`XML parsing failed: ${err.message}`] }
  }

  // Extract AAS data for downstream editor/visualizer usage regardless of schema result
  const aasData = extractAASDataFromXML(parsed)

  // If this is AAS 1.0, skip 3.x schema validation and treat as soft-compatible
  if (isLegacy10) {
    console.warn("[v0] Legacy AAS 1.0 detected. Skipping 3.x schema validation and allowing edit in compatibility mode.")
    console.log("[v0] ===== XML VALIDATION END (LEGACY 1.0 - SKIPPED SCHEMA) =====")
    return { valid: true, parsed, aasData }
  }

  // Schema URL remains the same file; it's versioned by target namespace inside.
  const schemaUrl =
    "https://raw.githubusercontent.com/admin-shell-io/aas-specs-metamodel/refs/heads/master/schemas/xml/AAS.xsd"

  try {
    console.log(`[v0] Fetching AAS schema from: ${schemaUrl}`)
    const res = await fetch(schemaUrl, { mode: 'cors' })
    if (!res.ok) {
      const errorMsg = `Failed to fetch AAS schema: ${res.status} ${res.statusText}. Cannot perform full schema validation.`
      console.warn(`[v0] ${errorMsg}`)
      console.log("[v0] ===== XML VALIDATION END (FAILED - SCHEMA FETCH FAILED) =====")
      return { valid: false, errors: [errorMsg], parsed, aasData }
    }
    const xsd = await res.text()
    console.log(`[v0] Schema fetched successfully, length: ${xsd.length}`)

    console.log("[v0] Starting XML validation against AAS schema (external service)...")
    const xmlForValidation = is31 ? originalXml : upgradedTo31Xml
    const validationResult = await validateXml(xmlForValidation, xsd)
    console.log("[v0] External validation service result:", validationResult)

    if (validationResult.valid) {
      console.log("[v0] XML validation PASSED")
      console.log("[v0] ===== XML VALIDATION END (PASSED) =====")
      return { valid: true, parsed, aasData }
    } else {
      let errors = validationResult.errors ?? ["XML validation failed"]
      if (is30) {
        errors = [
          "Compatibility check: This XML declares AAS 3.0. We validated against 3.1 to highlight upgrade issues; you can still edit and use 'Fix' to upgrade.",
          ...errors,
        ]
      }
      console.log("[v0] XML validation FAILED with errors:", errors)
      console.log("[v0] ===== XML VALIDATION END (FAILED) =====")
      return { valid: false, errors, parsed, aasData }
    }
  } catch (err: any) {
    const errorMsg = `Schema validation error (external service issue): ${err.message}. Cannot perform full schema validation.`
    console.error("[v0] " + errorMsg, err)
    console.log("[v0] ===== XML VALIDATION END (FAILED - EXTERNAL SERVICE ERROR) =====")
    return { valid: false, errors: [errorMsg], parsed, aasData }
  }
}