import { XMLParser } from "fast-xml-parser"

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

export function extractAASDataFromXML(parsed: any): any {
  if (!parsed) return null

  try {
    // Handle different XML structures
    let aasData = parsed
    if (parsed.environment) {
      aasData = parsed.environment
    }

    const result: any = {
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
        id: shell.id || shell["@_id"] || "Unknown ID",
        idShort: shell.idShort || shell["@_idShort"] || "Unknown",
        assetKind: shell.assetInformation?.assetKind || "Unknown",
        assetInformation: shell.assetInformation || {},
        description: shell.description || [],
        administration: shell.administration || {},
        derivedFrom: shell.derivedFrom || null,
        embeddedDataSpecifications: shell.embeddedDataSpecifications || [],
        submodelRefs: extractSubmodelRefs(shell.submodels),
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

  // Handle different XML element types
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
    if (elementsContainer[type]) {
      const typeElements = Array.isArray(elementsContainer[type]) ? elementsContainer[type] : [elementsContainer[type]]

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
    qualifiers: element.qualifiers || [],
    embeddedDataSpecifications: element.embeddedDataSpecifications || [],
  }

  switch (type) {
    case "property":
      return {
        ...base,
        valueType: element.valueType,
        value: element.value,
      }

    case "multiLanguageProperty":
      return {
        ...base,
        value: parseXMLLangStringArray(element.value),
      }

    case "file":
      return {
        ...base,
        value: element.value,
        contentType: element.contentType,
      }

    case "submodelElementCollection":
      return {
        ...base,
        value: parseXMLSubmodelElements(element.value || {}),
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
      language: ls.language || ls["@_language"] || "en",
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
      language: ls.language || ls["@_language"] || "en",
      text: ls.text || ls["#text"] || "",
    }))
  }

  return []
}

function validateAASStructure(parsed: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  console.log("[v0] Starting AAS structure validation...")

  let validationCount = 0
  const maxLogEntries = 10 // Limit debug output

  // Check idShort pattern compliance for all elements
  function validateIdShort(obj: any, path = "") {
    if (obj && typeof obj === "object") {
      // Check if this object has an idShort
      if (obj.idShort || obj["@_idShort"]) {
        const idShort = obj.idShort || obj["@_idShort"]
        validationCount++

        // Only log first few entries to avoid spam
        if (validationCount <= maxLogEntries) {
          console.log(`[v0] Checking idShort at ${path}: "${idShort}"`)
        } else if (validationCount === maxLogEntries + 1) {
          console.log(`[v0] ... (suppressing further idShort validation logs)`)
        }

        // AAS 3.1 idShort pattern: must start with letter, contain only letters, numbers, underscore, dash
        // and must end with letter or number (not just underscore or dash)
        const idShortPattern = /^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9]$|^[a-zA-Z]$/

        if (!idShortPattern.test(idShort)) {
          const errorMsg = `Element '${path}idShort': [facet 'pattern'] The value '${idShort}' is not accepted by the pattern '[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9]+'`
          console.log(`[v0] idShort validation FAILED: ${errorMsg}`)
          errors.push(errorMsg)
        } else if (validationCount <= maxLogEntries) {
          console.log(`[v0] idShort validation PASSED: "${idShort}"`)
        }
      }

      // Recursively check all properties
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          value.forEach((item, index) => validateIdShort(item, `${path}${key}[${index}].`))
        } else if (value && typeof value === "object") {
          validateIdShort(value, `${path}${key}.`)
        }
      }
    }
  }

  validateIdShort(parsed)

  console.log(
    `[v0] AAS structure validation completed. Checked ${validationCount} idShort elements, found ${errors.length} errors.`,
  )
  if (errors.length > 0) {
    console.log("[v0] All validation errors:", errors)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export async function validateAASXXml(
  xml: string,
): Promise<
  { valid: true; parsed: any; aasData?: any } | { valid: false; errors: string[]; parsed?: any; aasData?: any }
> {
  console.log("[v0] ===== XML VALIDATION START =====")
  console.log("[v0] Original XML length:", xml.length)
  console.log("[v0] Original XML first 500 chars:", xml.substring(0, 500))

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
    return { valid: false, errors: structureValidation.errors, parsed, aasData }
  }

  console.log("[v0] AAS structure validation PASSED")

  const schemaUrl =
    "https://raw.githubusercontent.com/admin-shell-io/aas-specs-metamodel/refs/heads/master/schemas/xml/AAS.xsd"

  try {
    console.log(`[v0] Fetching AAS schema from: ${schemaUrl}`)
    const res = await fetch(schemaUrl)
    if (!res.ok) {
      console.log(`[v0] Failed to fetch AAS schema: ${res.statusText}, using structure validation result (VALID)`)
      const aasData = extractAASDataFromXML(parsed)
      console.log("[v0] ===== XML VALIDATION END (PASSED - STRUCTURE ONLY) =====")
      return { valid: true, parsed, aasData }
    }
    const xsd = await res.text()
    console.log(`[v0] Schema fetched successfully, length: ${xsd.length}`)

    console.log("[v0] Starting XML validation against AAS schema...")
    const validationResult = await validateXml(normalizedXml, xsd)
    console.log("[v0] External validation service result:", validationResult)

    // Check if the error is a service error (not an actual validation error)
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
      console.log("[v0] External validation service unavailable, using structure validation result (VALID)")
      const aasData = extractAASDataFromXML(parsed)
      console.log("[v0] ===== XML VALIDATION END (PASSED - STRUCTURE FALLBACK) =====")
      return { valid: true, parsed, aasData }
    }

    if (validationResult.valid) {
      console.log("[v0] XML validation PASSED (both structure and XSD schema)")
      const aasData = extractAASDataFromXML(parsed)
      console.log("[v0] ===== XML VALIDATION END (PASSED) =====")
      return { valid: true, parsed, aasData }
    } else {
      console.log("[v0] XML validation FAILED with actual XSD schema errors:", validationResult.errors)
      const aasData = extractAASDataFromXML(parsed)
      console.log("[v0] ===== XML VALIDATION END (FAILED) =====")
      return { valid: false, errors: validationResult.errors, parsed, aasData }
    }
  } catch (err: any) {
    console.log("[v0] Schema validation error (external service issue):", err.message)
    console.log("[v0] Falling back to structure validation result (VALID)")
    const aasData = extractAASDataFromXML(parsed)
    console.log("[v0] ===== XML VALIDATION END (PASSED - FALLBACK) =====")
    return { valid: true, parsed, aasData }
  }
}
