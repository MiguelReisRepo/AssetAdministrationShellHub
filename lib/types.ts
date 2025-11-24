import type { File } from "formdata-node"

// General validation error structure
export interface ValidationError {
  path: string
  message: string
}

// General validation result structure
export interface ValidationResult {
  file: string
  type: "XML" | "JSON" | "AASX"
  valid: boolean
  errors?: string[] | ValidationError[]
  processingTime: number
  parsed?: any
  thumbnail?: string
  aasData?: any
  attachments?: Record<string, string>
  // ADDED: raw uploaded XML to allow the editor to validate the exact bytes
  originalXml?: string
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