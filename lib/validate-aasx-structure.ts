// Browser-compatible JSON schema validation
interface ValidationError {
  path: string
  message: string
}

interface ValidationResult {
  valid: boolean
  errors?: ValidationError[]
}

const VALID_MODEL_TYPES = [
  "Property",
  "MultiLanguageProperty",
  "Range",
  "File",
  "Blob",
  "ReferenceElement",
  "SubmodelElementCollection",
  "SubmodelElementList",
  "RelationshipElement",
  "AnnotatedRelationshipElement",
  "Entity",
  "BasicEventElement",
  "Operation",
]

// Simple JSON structure validation for AAS format
function validateAASStructure(data: any): ValidationResult {
  const errors: ValidationError[] = []

  // Check if it's a valid object
  if (!data || typeof data !== "object") {
    errors.push({ path: "/", message: "Root must be an object" })
    return { valid: false, errors }
  }

  // Check for required AAS structure
  if (!data.idShort) {
    errors.push({ path: "/", message: "Missing idShort in top-level AAS structure" })
  }

  if (!data.submodels || !Array.isArray(data.submodels)) {
    errors.push({ path: "/", message: "Missing or invalid submodels array" })
    return { valid: false, errors }
  }

  // Validate each submodel
  data.submodels.forEach((submodel: any, index: number) => {
    if (!submodel || typeof submodel !== "object") {
      errors.push({
        path: `/submodels/${index}`,
        message: "Submodel must be an object",
      })
      return
    }

    if (!submodel.idShort) {
      errors.push({
        path: `/submodels/${index}`,
        message: "Missing idShort in submodel",
      })
    }

    if (!submodel.id) {
      errors.push({
        path: `/submodels/${index}`,
        message: "Missing id in submodel",
      })
    }

    if (!Array.isArray(submodel.submodelElements)) {
      errors.push({
        path: `/submodels/${index}`,
        message: "Missing or invalid submodelElements array",
      })
    } else {
      submodel.submodelElements.forEach((element: any, elemIndex: number) => {
        if (!element || typeof element !== "object") {
          errors.push({
            path: `/submodels/${index}/submodelElements/${elemIndex}`,
            message: "SubmodelElement must be an object",
          })
          return
        }

        if (!element.modelType) {
          errors.push({
            path: `/submodels/${index}/submodelElements/${elemIndex}`,
            message: "Missing modelType in submodelElement",
          })
        } else if (!VALID_MODEL_TYPES.includes(element.modelType)) {
          errors.push({
            path: `/submodels/${index}/submodelElements/${elemIndex}`,
            message: `Invalid modelType: ${element.modelType}. Must be one of: ${VALID_MODEL_TYPES.join(", ")}`,
          })
        }

        if (!element.idShort) {
          errors.push({
            path: `/submodels/${index}/submodelElements/${elemIndex}`,
            message: "Missing idShort in submodelElement",
          })
        }

        // Recursively validate nested elements in collections
        if (element.modelType === "SubmodelElementCollection" && Array.isArray(element.value)) {
          validateSubmodelElements(element.value, `/submodels/${index}/submodelElements/${elemIndex}/value`, errors)
        }
      })
    }
  })

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
}

function validateSubmodelElements(elements: any[], basePath: string, errors: ValidationError[]) {
  elements.forEach((element: any, index: number) => {
    if (!element || typeof element !== "object") {
      errors.push({
        path: `${basePath}/${index}`,
        message: "SubmodelElement must be an object",
      })
      return
    }

    if (!element.modelType) {
      errors.push({
        path: `${basePath}/${index}`,
        message: "Missing modelType in nested submodelElement",
      })
    } else if (!VALID_MODEL_TYPES.includes(element.modelType)) {
      errors.push({
        path: `${basePath}/${index}`,
        message: `Invalid modelType: ${element.modelType}`,
      })
    }

    if (!element.idShort) {
      errors.push({
        path: `${basePath}/${index}`,
        message: "Missing idShort in nested submodelElement",
      })
    }

    // Recursively validate nested collections
    if (element.modelType === "SubmodelElementCollection" && Array.isArray(element.value)) {
      validateSubmodelElements(element.value, `${basePath}/${index}/value`, errors)
    }
  })
}

export { validateAASStructure }
export type { ValidationError, ValidationResult }
