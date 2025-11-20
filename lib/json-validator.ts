import type { ValidationResult, ParsedAASData, ValidationError, AASInfo, SubmodelInfo } from "./types"

// Simple JSON structure validation for AAS format
export function validateAASStructure(data: any): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = []
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
          errors.push({ path: `${path}idShort`, message: errorMsg })
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

  validateIdShort(data) // Start validation from the root data object

  // Check for at least one of the main AAS properties (more flexible)
  const hasAnyAASProperty =
    data.assetAdministrationShells || data.shells || data.submodels || data.conceptDescriptions || data.environment

  if (!hasAnyAASProperty) {
    errors.push({
      path: "/",
      message:
        "Missing AAS structure: Expected at least one of assetAdministrationShells, submodels, or conceptDescriptions",
    })
  }

  // Only validate structure if arrays exist (don't require specific properties)
  const shells = data.assetAdministrationShells || data.shells || []
  if (Array.isArray(shells) && shells.length > 0) {
    shells.forEach((shell: any, index: number) => {
      // Only check if shell is an object, don't require specific properties
      if (!shell || typeof shell !== "object") {
        errors.push({
          path: `/assetAdministrationShells/${index}`,
          message: "Shell must be an object",
        })
      }
    })
  }

  const submodels = data.submodels || []
  if (Array.isArray(submodels) && submodels.length > 0) {
    submodels.forEach((submodel: any, index: number) => {
      // Only check if submodel is an object, don't require specific properties
      if (!submodel || typeof submodel !== "object") {
        errors.push({
          path: `/submodels/${index}`,
          message: "Submodel must be an object",
        })
      }
    })
  }

  console.log(
    `[v0] AAS structure validation completed. Checked ${validationCount} idShort elements, found ${errors.length} errors.`,
  )
  if (errors.length > 0) {
    console.log("[v0] All validation errors:", errors)
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : [] }
}

export function parseAASData(data: any): ParsedAASData | null {
  try {
    const result: ParsedAASData = {
      assetAdministrationShells: [],
      submodels: [],
      rawData: data,
    }

    // Parse Asset Administration Shells
    const shells = data.assetAdministrationShells || data.shells || []
    if (Array.isArray(shells)) {
      shells.forEach((shell: any) => {
        if (shell && typeof shell === "object") {
          const aasInfo: AASInfo = {
            id: shell.id || "Unknown ID",
            idShort: shell.idShort || "Unknown",
            assetKind: shell.assetInformation?.assetKind || "Unknown",
            assetInformation: shell.assetInformation || {},
            description: shell.description || [],
            administration: shell.administration || {},
            derivedFrom: shell.derivedFrom || null,
            embeddedDataSpecifications: shell.embeddedDataSpecifications || [],
            submodelRefs: [],
            rawData: shell,
          }

          // Extract submodel references
          if (shell.submodels && Array.isArray(shell.submodels)) {
            aasInfo.submodelRefs = shell.submodels
              .map((ref: any) => {
                if (ref.keys && Array.isArray(ref.keys) && ref.keys[0]?.value) {
                  return ref.keys[0].value
                }
                return null
              })
              .filter(Boolean)
          }

          result.assetAdministrationShells.push(aasInfo)
        }
      })
    }

    // Parse Submodels with complete element structure
    const submodels = data.submodels || []
    if (Array.isArray(submodels)) {
      submodels.forEach((submodel: any) => {
        if (submodel && typeof submodel === "object") {
          const submodelInfo: SubmodelInfo = {
            idShort: submodel.idShort || "Unknown",
            id: submodel.id || "Unknown ID",
            kind: submodel.kind || "Unknown",
            description: submodel.description || [],
            administration: submodel.administration || {},
            semanticId: submodel.semanticId || null,
            qualifiers: submodel.qualifiers || [],
            embeddedDataSpecifications: submodel.embeddedDataSpecifications || [],
            submodelElements: parseSubmodelElements(submodel.submodelElements || []),
            rawData: submodel,
          }
          result.submodels.push(submodelInfo)
        }
      })
    }

    return result
  } catch (error) {
    console.error("Error parsing AAS data:", error)
    return null
  }
}

export function parseSubmodelElements(elements: any[]): any[] {
  if (!Array.isArray(elements)) return []

  return elements.map((element: any) => {
    if (!element || typeof element !== "object") return element

    const parsed: any = {
      idShort: element.idShort || "Unknown",
      modelType: element.modelType || "Unknown",
      category: element.category,
      description: element.description || [],
      semanticId: element.semanticId,
      qualifiers: element.qualifiers || [],
      embeddedDataSpecifications: element.embeddedDataSpecifications || [],
    }
    // ADDED: editor metadata for visualizer display
    parsed.preferredName = element.preferredName
    parsed.shortName = element.shortName
    parsed.dataType = element.dataType
    parsed.unit = element.unit
    parsed.cardinality = element.cardinality

    // Handle different element types
    switch (element.modelType) {
      case "Property":
        parsed.valueType = element.valueType
        parsed.value = element.value
        break

      case "MultiLanguageProperty":
        parsed.value = element.value || []
        break

      case "File":
        parsed.value = element.value
        parsed.contentType = element.contentType
        break

      case "SubmodelElementCollection":
        parsed.value = parseSubmodelElements(element.value || [])
        break

      case "SubmodelElementList":
        parsed.typeValueListElement = element.typeValueListElement
        parsed.value = parseSubmodelElements(element.value || [])
        break

      case "BasicEventElement":
        parsed.observed = element.observed
        parsed.direction = element.direction
        parsed.state = element.state
        break

      case "Range":
        parsed.valueType = element.valueType
        parsed.min = element.min
        parsed.max = element.max
        break

      case "Blob":
        parsed.value = element.value
        parsed.contentType = element.contentType
        break

      case "ReferenceElement":
        parsed.value = element.value
        break

      default:
        // For unknown types, preserve all properties
        Object.keys(element).forEach((key) => {
          if (!parsed.hasOwnProperty(key)) {
            parsed[key] = element[key]
          }
        })
    }

    return parsed
  })
}

// Validates raw JSON string against AAS structure
export async function validateAASXJson(
  jsonStr: string,
): Promise<{ valid: true; parsed: any; aasData?: ParsedAASData } | { valid: false; errors: string[]; parsed?: any }> {
  let parsedJson: any

  // Parse JSON
  try {
    parsedJson = JSON.parse(jsonStr)
  } catch (err) {
    return { valid: false, errors: ["Invalid JSON format: " + (err as Error).message] }
  }

  // Validate structure
  try {
    const result = validateAASStructure(parsedJson)

    if (result.valid) {
      console.log("Parsed JSON Object:", parsedJson)
      const aasData = parseAASData(parsedJson)
      return { valid: true, parsed: parsedJson, aasData }
    } else {
      const errors = (result.errors || []).map((e) => `${e.path}: ${e.message}`)
      console.error("JSON Validation Errors:", errors)
      return {
        valid: false,
        errors: errors.length > 0 ? errors : ["Unknown validation error"],
        parsed: parsedJson,
      }
    }
  } catch (err: any) {
    return { valid: false, errors: [`Validation error: ${err.message}`], parsed: parsedJson }
  }
}

// General JSON validation function (simplified for browser compatibility)
export async function validateJson(data: any, schemaUrl: string): Promise<{ valid: boolean; errors?: any }> {
  // For now, we'll use the same structure validation
  // In a production app, you might want to fetch and parse the actual schema
  console.log(`Validating against schema: ${schemaUrl}`)

  const result = validateAASStructure(data)
  return {
    valid: result.valid,
    errors: result.errors,
  }
}

// Schema loading function (kept for compatibility)
export async function loadSchema(url: string): Promise<any> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Error loading schema ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error("Error getting schema", err)
    throw err
  }
}