import type { File } from "formdata-node"

// General validation error structure
export interface ValidationError {
  path: string
  message: string
}

// General validation result structure
export interface ValidationResult {
  file: string // Original file name
  type: "XML" | "JSON" | "AASX" // Type of content validated
  valid: boolean
  errors?: string[] | ValidationError[] // Array of error messages or detailed errors
  processingTime: number // Time taken for validation in ms
  parsed?: any // The parsed content (e.g., XML to JSON, or AAS data structure)
  thumbnail?: string // Base64 data URL for AASX thumbnail
  aasData?: any // Structured AAS data extracted from parsed content
}

// Interfaces for parsed AAS data (simplified for display)
export interface AASInfo {
  id: string
  idShort: string
  assetKind: string
  assetInformation: any
  description: any[]
  administration: any
  derivedFrom: any
  embeddedDataSpecifications: any[]
  submodelRefs: string[]
  rawData: any
}

export interface SubmodelInfo {
  idShort: string
  id: string
  kind: string
  description: any[]
  administration: any
  semanticId: any
  qualifiers: any[]
  embeddedDataSpecifications: any[]
  submodelElements: any[] // Can contain nested elements
  rawData: any
}

export interface ParsedAASData {
  assetAdministrationShells: AASInfo[]
  submodels: SubmodelInfo[]
  rawData: any // The full parsed JSON/XML object
}