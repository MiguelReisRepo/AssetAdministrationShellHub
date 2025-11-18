"use client"

import { useState } from "react"
import { ChevronRight, ChevronDown, Download, ArrowLeft, FileText, Plus, Trash2, X, Upload, GripVertical } from 'lucide-react'
import JSZip from 'jszip'
import { validateAASXXml } from "@/lib/xml-validator" // Import the XML validation function
import type { ValidationResult } from "@/lib/types" // Import ValidationResult type

interface SubmodelTemplate {
  name: string
  version: string
  description: string
  url: string
}

interface SelectedSubmodel {
  template: SubmodelTemplate
  idShort: string
}

interface AASConfig {
  idShort: string
  id: string
  assetKind: "Instance" | "Type" // Added assetKind
  globalAssetId: string // Added globalAssetId
  selectedSubmodels: SelectedSubmodel[]
}

interface SubmodelElement {
  idShort: string
  modelType: "Property" | "MultiLanguageProperty" | "SubmodelElementCollection" | "SubmodelElementList" | "File"
  valueType?: string // For Property, Range
  value?: string | Record<string, string> // For Property, MultiLanguageProperty, File
  cardinality: "One" | "ZeroToOne" | "ZeroToMany" | "OneToMany"
  description?: string
  semanticId?: string
  children?: SubmodelElement[] // Explicitly for SubmodelElementCollection, SubmodelElementList
  preferredName?: string | Record<string, string>
  shortName?: string | Record<string, string>
  dataType?: string
  unit?: string
  category?: string
  fileData?: { content: string; mimeType: string; fileName: string } // For File
}

interface AASEditorProps {
  aasConfig: AASConfig
  onBack: () => void
  onFileGenerated?: (file: ValidationResult) => void // Use ValidationResult type
  onUpdateAASConfig: (newConfig: AASConfig) => void // New prop for updating AASConfig
}

export function AASEditor({ aasConfig, onBack, onFileGenerated, onUpdateAASConfig }: AASEditorProps) {
  const [submodelData, setSubmodelData] = useState<Record<string, SubmodelElement[]>>(() => {
    const initial: Record<string, SubmodelElement[]> = {}
    aasConfig.selectedSubmodels.forEach((sm) => {
      initial[sm.idShort] = generateTemplateStructure(sm.template.name)
    })
    return initial
  })
  
  const [selectedSubmodel, setSelectedSubmodel] = useState<SelectedSubmodel | null>(
    aasConfig.selectedSubmodels[0] || null
  )
  const [selectedElement, setSelectedElement] = useState<SubmodelElement | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [showAddSubmodel, setShowAddSubmodel] = useState(false)
  const [availableTemplates, setAvailableTemplates] = useState<SubmodelTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set())
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [templateSearchQuery, setSearchQuery] = useState("")
  const [draggedItem, setDraggedItem] = useState<{ path: string[]; element: SubmodelElement } | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)

  const [isGenerating, setIsGenerating] = useState(false)


  const loadTemplates = async () => {
    if (availableTemplates.length > 0) return
    
    setLoadingTemplates(true)
    try {
      const response = await fetch(
        "https://api.github.com/repos/admin-shell-io/submodel-templates/contents/published"
      )
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = await response.json()
      
      if (Array.isArray(data)) {
        const templates = data
          .filter((item: any) => item.type === "dir")
          .map((item: any) => ({
            name: item.name,
            version: "1.0",
            description: `IDTA ${item.name} submodel template`,
            url: item.html_url,
          }))
        setAvailableTemplates(templates)
      }
    } catch (error) {
      console.error("Failed to load templates:", error)
    } finally {
      setLoadingTemplates(false)
    }
  }

  const fetchTemplateDetails = async (templateName: string, version: string = "1/0"): Promise<SubmodelElement[] | null> => {
    try {
      // Try to fetch the JSON template file
      const jsonUrl = `https://raw.githubusercontent.com/admin-shell-io/submodel-templates/main/published/${encodeURIComponent(templateName)}/${version}/${encodeURIComponent(templateName)}.json`
      
      console.log("[v0] Fetching template from:", jsonUrl)
      const response = await fetch(jsonUrl)
      
      if (!response.ok) {
        console.log("[v0] Template JSON not found, using default structure")
        return null
      }
      
      const templateData = await response.json()
      console.log("[v0] Template data received:", templateData)
      
      // Parse the template structure
      if (templateData.submodelElements) {
        return parseSubmodelElements(templateData.submodelElements)
      }
      
      return null
    } catch (error) {
      console.error("[v0] Error fetching template details:", error)
      return null
    }
  }

  const parseSubmodelElements = (elements: any[]): SubmodelElement[] => {
    return elements.map(el => {
      const embeddedDataSpec = el.embeddedDataSpecifications?.[0]?.dataSpecificationContent
      
      const element: SubmodelElement = {
        idShort: el.idShort || "UnknownElement",
        modelType: el.modelType || "Property",
        valueType: el.valueType,
        value: el.modelType === "MultiLanguageProperty" ? { en: "" } : (el.modelType === "Property" || el.modelType === "File" ? "" : undefined), // Only set value for Property, MLP, File
        cardinality: determineCardinality(el),
        description: getDescription(el),
        semanticId: getSemanticId(el),
        preferredName: embeddedDataSpec?.preferredName,
        shortName: embeddedDataSpec?.shortName,
        dataType: embeddedDataSpec?.dataType,
        unit: embeddedDataSpec?.unit,
        category: el.category,
        // Removed sourceOfDefinition
      }
      
      // Parse children if it's a collection or list
      // Check both 'children' and 'value' for backward compatibility with template sources
      if (Array.isArray(el.children)) {
        element.children = parseSubmodelElements(el.children)
      } else if (Array.isArray(el.value)) { // Fallback for templates that might use 'value' for children
        element.children = parseSubmodelElements(el.value)
      }
      
      return element
    })
  }

  const getSemanticId = (element: any): string | undefined => {
    if (element.semanticId) {
      // Handle different semanticId structures
      if (typeof element.semanticId === 'string') {
        return element.semanticId
      }
      if (element.semanticId.keys && Array.isArray(element.semanticId.keys)) {
        const key = element.semanticId.keys[0]
        return key?.value || undefined
      }
    }
    return undefined
  }

  const getDescription = (element: any): string | undefined => {
    if (element.embeddedDataSpecifications && Array.isArray(element.embeddedDataSpecifications)) {
      const dataSpec = element.embeddedDataSpecifications.find((ds: any) => ds.dataSpecification?.type === "DataSpecificationIEC61360")
      if (dataSpec?.dataSpecificationContent?.definition) {
        const definition = dataSpec.dataSpecificationContent.definition
        if (Array.isArray(definition)) {
          const enDef = definition.find((d: any) => d.language === 'en')
          const text = enDef?.text || definition[0]?.text || ''
          // Ensure we return a string
          return typeof text === 'string' ? text : String(text)
        }
        // If definition is a string, return it
        if (typeof definition === 'string') {
          return definition
        }
      }
    }
    
    // Fallback to description field
    if (element.description) {
      if (typeof element.description === 'string') {
        return element.description
      }
      if (Array.isArray(element.description)) {
        const enDesc = element.description.find((d: any) => d.language === 'en')
        const text = enDesc?.text || element.description[0]?.text || ''
        // Ensure we return a string
        return typeof text === 'string' ? text : String(text)
      }
      // If it's an object but not an array, try to convert to string
      if (typeof element.description === 'object') {
        return ''
      }
    }
    return undefined
  }

  const determineCardinality = (element: any): "One" | "ZeroToOne" | "ZeroToMany" | "OneToMany" => {
    // Check for explicit cardinality in template
    if (element.cardinality) {
      return element.cardinality
    }
    
    // Infer from qualifiers or constraints
    const qualifiers = element.qualifiers || []
    const multiplicity = qualifiers.find((q: any) => q.type === "Multiplicity")
    
    if (multiplicity) {
      const value = multiplicity.value
      if (value === "One") return "One"
      if (value === "ZeroToOne") return "ZeroToOne"
      if (value === "ZeroToMany" || value === "*") return "ZeroToMany"
      if (value === "OneToMany") return "OneToMany"
    }
    
    // Default to ZeroToOne for optional elements
    return "ZeroToOne"
  }

  function generateTemplateStructure(templateName: string): SubmodelElement[] {
    // Note: This is called synchronously, so we use the hardcoded structure
    // The real fetch would need to happen at template selection time
    
    if (templateName.includes("Digital") || templateName.includes("Nameplate")) {
      return [
        { idShort: "URIOfTheProduct", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Unique global identification of the product using a universal resource identifier (URI)", semanticId: "0173-1#02-AAY811#001" },
        { idShort: "ManufacturerName", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "One", description: "legally valid designation of the natural or judicial person which is directly responsible for the design, production, packaging and labeling of a product in respect to its being brought into circulation", semanticId: "0173-1#02-AAO677#002" },
        { idShort: "ManufacturerProductDesignation", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "One", description: "Short description of the product (short text)", semanticId: "0173-1#02-AAW338#001" },
        { 
          idShort: "AddressInformation", 
          modelType: "SubmodelElementCollection", 
          cardinality: "ZeroToOne", 
          description: "Address information of a business partner",
          semanticId: "0173-1#02-AAQ832#005",
          children: [
            { idShort: "Street", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Street name and house number", semanticId: "0173-1#02-AAO128#002" },
            { idShort: "Zipcode", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "ZIP code of address", semanticId: "0173-1#02-AAO129#002" },
            { idShort: "CityTown", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "town or city", semanticId: "0173-1#02-AAO132#002" },
            { idShort: "Country", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "country code", semanticId: "0173-1#02-AAO134#002" },
          ]
        },
        { idShort: "ManufacturerProductRoot", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "ZeroToOne", description: "Top level of a 3 level manufacturer specific product hierarchy", semanticId: "0173-1#02-AAU732#001" },
        { idShort: "ManufacturerProductFamily", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "ZeroToOne", description: "2nd level of a 3 level manufacturer specific product hierarchy", semanticId: "0173-1#02-AAU731#001" },
        { idShort: "ManufacturerProductType", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Characteristic to differentiate between different products of a product family or special variants", semanticId: "0173-1#02-AAO057#002" },
        { idShort: "OrderCodeOfManufacturer", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "By manufactures issued unique combination of numbers and letters used to order the product", semanticId: "0173-1#02-AAO227#002" },
        { idShort: "ProductArticleNumberOfManufacturer", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "unique product identifier of the manufacturer for the product type to which the serialized product belongs", semanticId: "0173-1#02-AAO676#003" },
        { idShort: "SerialNumber", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "unique combination of numbers and letters used to identify the device once it has been manufactured", semanticId: "0173-1#02-AAM556#002" },
        { idShort: "YearOfConstruction", modelType: "Property", valueType: "integer", value: "", cardinality: "ZeroToOne", description: "Year as completion date of object", semanticId: "0173-1#02-AAP906#001" },
        { idShort: "DateOfManufacture", modelType: "Property", valueType: "date", value: "", cardinality: "ZeroToOne", description: "Date from which the production and / or development process is completed or from which a service is provided completely", semanticId: "0173-1#02-AAR972#002" },
        { idShort: "HardwareVersion", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Version of the hardware supplied with the device", semanticId: "0173-1#02-AAN270#002" },
        { idShort: "FirmwareVersion", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "version of the firmware supplied with the device", semanticId: "0173-1#02-AAN269#002" },
        { idShort: "SoftwareVersion", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Version of the software used by the device", semanticId: "0173-1#02-AAN271#002" },
        { idShort: "CountryOfOrigin", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Country where the product was manufactured", semanticId: "0173-1#02-AAO259#004" },
        { idShort: "CompanyLogo", modelType: "File", value: "", cardinality: "ZeroToOne", description: "A graphic mark used to represent a company, an organisation or a product", semanticId: "0173-1#02-AAQ163#002" },
        {
          idShort: "Markings",
          modelType: "SubmodelElementCollection", // Changed from SubmodelElementList
          cardinality: "ZeroToOne",
          description: "Collection of product markings",
          semanticId: "0173-1#01-AHD492#001",
          children: [
            // Removed nested Marking collection, now direct properties
            { idShort: "MarkingName", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "common name of the marking", semanticId: "0173-1#02-AAU734#001" },
            { idShort: "DesignationOfCertificateOrApproval", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "alphanumeric character sequence identifying a certificate or approval", semanticId: "0173-1#02-AAO200#002" },
            { idShort: "MarkingFile", modelType: "File", value: "", cardinality: "ZeroToOne", description: "picture or document of the marking", semanticId: "0173-1#02-AAU733#001" },
          ]
        },
        {
          idShort: "AssetSpecificProperties",
          modelType: "SubmodelElementCollection",
          cardinality: "ZeroToOne",
          description: "Group of properties that are listed on the asset's nameplate and have to be reported to a authority",
          children: [
            {
              idShort: "GuidelineSpecificProperties",
              modelType: "SubmodelElementCollection",
              cardinality: "ZeroToOne",
              description: "Properties specific to the guideline",
              children: [
                { idShort: "GuidelineForConformityDeclaration", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Guideline, regulation or rule, which was followed to issue a declaration of conformity", semanticId: "0173-1#02-AAO640#002" },
              ]
            }
          ]
        }
      ]
    }
    
    if (templateName.includes("Contact")) {
      return [
        { idShort: "RoleOfContactPerson", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Role of contact person", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/RoleOfContactPerson" },
        { idShort: "NameOfContact", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "One", description: "Name of contact", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/NameOfContact" },
        { idShort: "FirstName", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "First name", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/FirstName" },
        { idShort: "MiddleNames", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Middle names", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/MiddleNames" },
        { idShort: "Title", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Academic title", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/Title" },
        { idShort: "Email", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Email address", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/Email" },
        { idShort: "Phone", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Phone number", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/Phone" },
        { idShort: "Fax", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Fax number", semanticId: "https://admin-shell.io/zvei/contact/1/0/Contact/Fax" },
      ]
    }
    
    if (templateName.includes("Technical") || templateName.includes("Data")) {
      return [
        { idShort: "GeneralInformation", modelType: "SubmodelElementCollection", cardinality: "One", description: "General technical information",
          semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/GeneralInformation",
          children: [
            { idShort: "ManufacturerName", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "One", description: "Manufacturer name", semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/ManufacturerName" },
            { idShort: "ManufacturerProductDesignation", modelType: "MultiLanguageProperty", value: { en: "" }, cardinality: "One", description: "Product designation", semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/ManufacturerProductDesignation" },
            { idShort: "ManufacturerPartNumber", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Part number", semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/ManufacturerPartNumber" },
          ]
        },
        { idShort: "TechnicalProperties", modelType: "SubmodelElementCollection", cardinality: "ZeroToOne", description: "Technical properties",
          semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/TechnicalProperties",
          children: [
            { idShort: "NominalVoltage", modelType: "Property", valueType: "float", value: "", cardinality: "ZeroToOne", description: "Nominal voltage", semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/NominalVoltage" },
            { idShort: "NominalCurrent", modelType: "Property", valueType: "float", value: "", cardinality: "ZeroToOne", description: "Nominal current", semanticId: "https://admin-shell.io/zvei/technicaldatacollection/1/0/TechnicalDataCollection/NominalCurrent" },
          ]
        },
      ]
    }
    
    if (templateName.includes("Carbon") || templateName.includes("Footprint")) {
      return [
        { idShort: "PCF", modelType: "SubmodelElementCollection", cardinality: "One", description: "Product Carbon Footprint",
          semanticId: "https://admin-shell.io/zvei/carbonfootprint/1/0/ProductCarbonFootprint/PCF",
          children: [
            { idShort: "PCFCalculationMethod", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Calculation method", semanticId: "https://admin-shell.io/zvei/carbonfootprint/1/0/ProductCarbonFootprint/PCFCalculationMethod" },
            { idShort: "PCFCO2eq", modelType: "Property", valueType: "float", value: "", cardinality: "One", description: "CO2 equivalent in kg", semanticId: "https://admin-shell.io/zvei/carbonfootprint/1/0/ProductCarbonFootprint/PCFCO2eq" },
            { idShort: "PCFReferenceValueForCalculation", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Reference value", semanticId: "https://admin-shell.io/zvei/carbonfootprint/1/0/ProductCarbonFootprint/PCFReferenceValueForCalculation" },
          ]
        },
      ]
    }
    
    if (templateName.includes("Handover")) {
      return [
        { idShort: "HandoverDocumentation", modelType: "SubmodelElementCollection", cardinality: "One", description: "Handover documentation",
          semanticId: "https://admin-shell.io/zvei/handover/1/0/HandoverDocumentation/HandoverDocumentation",
          children: [
            { idShort: "DocumentClassification", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Document classification", semanticId: "https://admin-shell.io/zvei/handover/1/0/HandoverDocumentation/DocumentClassification" },
            { idShort: "DocumentVersionId", modelType: "Property", valueType: "string", value: "", cardinality: "One", description: "Document version", semanticId: "https://admin-shell.io/zvei/handover/1/0/HandoverDocumentation/DocumentVersionId" },
          ]
        },
      ]
    }
    
    return [
      { idShort: "Property1", modelType: "Property", valueType: "string", value: "", cardinality: "ZeroToOne", description: "Custom property" },
    ]
  }

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const hasChildren = (element: SubmodelElement): boolean => {
    return element.children !== undefined && element.children.length > 0
  }

  const updateElementValue = (
    submodelId: string, 
    path: string[], 
    newValue: string | Record<string, string>
  ) => {
    setSubmodelData((prev) => {
      const newData = { ...prev }
      const updateInElements = (elements: SubmodelElement[], currentPath: string[]): SubmodelElement[] => {
        if (currentPath.length === 0) return elements
        
        const [current, ...rest] = currentPath
        return elements.map(el => {
          if (el.idShort === current) {
            if (rest.length === 0) {
              const updated = { ...el, value: newValue }
              setSelectedElement(updated)
              return updated
            } else if (el.children) {
              return { ...el, children: updateInElements(el.children, rest) }
            }
          }
          return el
        })
      }
      
      newData[submodelId] = updateInElements(newData[submodelId], path)
      return newData
    })
  }

  const updateElementMetadata = (
    submodelId: string,
    path: string[],
    field: keyof SubmodelElement,
    newValue: any
  ) => {
    setSubmodelData((prev) => {
      const newData = { ...prev }
      const updateInElements = (elements: SubmodelElement[], currentPath: string[]): SubmodelElement[] => {
        if (currentPath.length === 0) return elements
        
        const [current, ...rest] = currentPath
        return elements.map(el => {
          if (el.idShort === current) {
            if (rest.length === 0) {
              const updated = { ...el, [field]: newValue }
              setSelectedElement(updated)
              return updated
            } else if (el.children) {
              return { ...el, children: updateInElements(el.children, rest) }
            }
          }
          return el
        })
      }
      
      newData[submodelId] = updateInElements(newData[submodelId], path)
      return newData
    })
  }

  const getTypeBadge = (type: string) => {
    const badgeMap: Record<string, { label: string; color: string }> = {
      SubmodelElementCollection: { label: "SMC", color: "#61caf3" },
      Property: { label: "Prop", color: "#6662b4" },
      MultiLanguageProperty: { label: "MLP", color: "#ffa500" },
      File: { label: "File", color: "#10b981" },
      SubmodelElementList: { label: "SML", color: "#61caf3" },
    }
    const badge = badgeMap[type] || { label: "Node", color: "#1793b8" }
    return (
      <span 
        className="px-2 py-0.5 text-white text-xs font-semibold rounded"
        style={{ backgroundColor: badge.color }}
      >
        {badge.label}
      </span>
    )
  }

  const getCardinalityBadge = (cardinality: string) => {
    const colorMap: Record<string, string> = {
      "One": "bg-red-600",
      "ZeroToOne": "bg-yellow-600",
      "ZeroToMany": "bg-blue-600",
      "OneToMany": "bg-purple-600"
    }
    return (
      <span className={`px-2 py-0.5 ${colorMap[cardinality]} text-white text-xs font-semibold rounded`}>
        {cardinality}
      </span>
    )
  }
  const reorderElements = (submodelId: string, parentPath: string[], fromIndex: number, toIndex: number) => {
    setSubmodelData((prev) => {
      const newData = { ...prev }
      const reorderInElements = (elements: SubmodelElement[], currentPath: string[]): SubmodelElement[] => {
        if (currentPath.length === 0) {
          // Reorder at root level
          const newElements = [...elements]
          const [movedElement] = newElements.splice(fromIndex, 1)
          newElements.splice(toIndex, 0, movedElement)
          return newElements
        }
        
        const [current, ...rest] = currentPath
        return elements.map(el => {
          if (el.idShort === current && el.children) {
            return { ...el, children: reorderInElements(el.children, rest) }
          }
          return el
        })
      }
      
      newData[submodelId] = reorderInElements(newData[submodelId], parentPath)
      return newData
    })
  }

  const renderTreeNode = (
    element: SubmodelElement, 
    depth: number, 
    path: string[],
    index: number, // Added index for reordering
    siblings: SubmodelElement[] // Added siblings for reordering
  ): React.ReactNode => {
    const nodeId = path.join('.')
    const isExpanded = expandedNodes.has(nodeId)
    const isSelected = selectedElement?.idShort === element.idShort && 
                      JSON.stringify(path) === JSON.stringify([element.idShort])
    const hasKids = hasChildren(element)
    const isDeletable = canDelete(element.cardinality)
    const hasValidationError = validationErrors.has(nodeId)
    // Drag and drop state for styling
    const isDragging = draggedItem?.path.join('.') === nodeId
    const isDragOver = dragOverItem === nodeId

    const getDisplayValue = (): string => {
      if (element.modelType === "Property") {
        return typeof element.value === 'string' && element.value ? element.value : ''
      } else if (element.modelType === "MultiLanguageProperty") {
        if (typeof element.value === 'object' && element.value !== null) {
          const entries = Object.entries(element.value).filter(([_, text]) => text)
          if (entries.length > 0) {
            return entries.map(([lang, text]) => `${lang}: ${text}`).join(', ')
          }
        }
      }
      return ''
    }

    const displayValue = getDisplayValue()
    const parentPath = path.slice(0, -1) // Get the path to the parent

    return (
      <div key={nodeId} style={{ marginLeft: depth > 0 ? "0px" : "0" }}>
        {/* Added draggable, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop attributes */}
        <div
          draggable={selectedSubmodel !== null}
          onDragStart={(e) => {
            if (!selectedSubmodel) return
            setDraggedItem({ path, element })
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => {
            setDraggedItem(null)
            setDragOverItem(null)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (!draggedItem) return
            
            // Only allow drop if same parent
            const draggedParentPath = draggedItem.path.slice(0, -1).join('.')
            const currentParentPath = parentPath.join('.')
            
            if (draggedParentPath === currentParentPath) {
              setDragOverItem(nodeId)
            }
          }}
          onDragLeave={() => {
            setDragOverItem(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (!draggedItem || !selectedSubmodel) return
            
            // Check if same parent
            const draggedParentPath = draggedItem.path.slice(0, -1)
            const currentParentPath = parentPath
            
            if (JSON.stringify(draggedParentPath) === JSON.stringify(currentParentPath)) {
              // Find indices
              const draggedIndex = siblings.findIndex(el => el.idShort === draggedItem.element.idShort)
              const targetIndex = index
              
              if (draggedIndex !== -1 && draggedIndex !== targetIndex) {
                reorderElements(selectedSubmodel.idShort, parentPath, draggedIndex, targetIndex)
              }
            }
            
            setDraggedItem(null)
            setDragOverItem(null)
          }}
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 group ${
            isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-[#61caf3]" : ""
          } ${hasValidationError ? "border-2 border-red-500 bg-red-50 dark:bg-red-900/20" : ""}
          ${isDragging ? "opacity-50" : ""}
          ${isDragOver ? "border-t-2 border-[#61caf3]" : ""}`}
          style={{ paddingLeft: hasKids ? `${depth * 20 + 12}px` : `${depth * 20 + 12}px` }}
          onClick={() => {
            setSelectedElement(element)
            if (hasKids) toggleNode(nodeId)
          }}
        >
          <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
          
          <div className="w-4">
            {hasKids && (
              <span onClick={(e) => { e.stopPropagation(); toggleNode(nodeId) }}>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </span>
            )}
          </div>
          {getTypeBadge(element.modelType)}
          <span className={`text-sm font-medium flex-1 ${hasValidationError ? 'text-red-700 dark:text-red-400' : ''}`}>
            {element.idShort}
            {displayValue && (
              <span className="text-gray-600 dark:text-gray-400 font-normal ml-2">
                = {displayValue}
              </span>
            )}
            {(element.cardinality === "One" || element.cardinality === "OneToMany") && 
             !hasKids && 
             !displayValue && (
              <span className="text-red-500 ml-1">*</span>
            )}
          </span>
          {hasKids && (
            <span className="text-xs text-gray-500">
              ({element.children?.length || 0})
            </span>
          )}
          {isDeletable && selectedSubmodel && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                deleteElement(selectedSubmodel.idShort, path)
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete element (optional)"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {isExpanded && hasKids && element.children && (
          <div>
            {element.children.map((child, idx) => 
              renderTreeNode(child, depth + 1, [...path, child.idShort], idx, element.children!)
            )}
          </div>
        )}
      </div>
    )
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, submodelId: string, elementPath: string[]) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      const fileData = {
        content: reader.result as string,
        mimeType: file.type,
        fileName: file.name
      }
      
      // Update element with file data
      updateElementMetadata(submodelId, elementPath, 'fileData', fileData)
      // Update value with file path
      updateElementValue(submodelId, elementPath, `/files/${file.name}`)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const renderEditableDetails = () => {
    if (!selectedElement || !selectedSubmodel) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          Select an element to edit
        </div>
      )
    }

    const isRequired = selectedElement.cardinality === "One" || selectedElement.cardinality === "OneToMany"
    const isMultiple = selectedElement.cardinality === "ZeroToMany" || selectedElement.cardinality === "OneToMany"

    const buildPath = (element: SubmodelElement, elements: SubmodelElement[], currentPath: string[] = []): string[] | null => {
      for (const el of elements) {
        if (el.idShort === element.idShort) {
          return [...currentPath, el.idShort]
        }
        if (el.children) {
          const found = buildPath(element, el.children, [...currentPath, el.idShort])
          if (found) return found
        }
      }
      return null
    }

    const elementPath = buildPath(selectedElement, submodelData[selectedSubmodel.idShort] || []) || [selectedElement.idShort]

    const addLanguageToMLP = (newLang: string) => {
      if (selectedElement.modelType !== "MultiLanguageProperty") return
      
      const currentValue = typeof selectedElement.value === 'object' && selectedElement.value !== null ? selectedElement.value : { en: '' }
      if (!currentValue[newLang]) {
        const updatedValue = { ...currentValue, [newLang]: '' }
        updateElementValue(selectedSubmodel.idShort, elementPath, updatedValue)
      }
    }

    const removeLanguageFromMLP = (lang: string) => {
      if (selectedElement.modelType !== "MultiLanguageProperty") return
      if (lang === 'en') return // Always keep English
      
      const currentValue = typeof selectedElement.value === 'object' && selectedElement.value !== null ? { ...selectedElement.value } : { en: '' }
      delete currentValue[lang]
      updateElementValue(selectedSubmodel.idShort, elementPath, currentValue)
    }

    const updateMLPLanguageValue = (lang: string, text: string) => {
      if (selectedElement.modelType !== "MultiLanguageProperty") return
      
      const currentValue = typeof selectedElement.value === 'object' && selectedElement.value !== null ? { ...selectedElement.value } : { en: '' }
      currentValue[lang] = text
      updateElementValue(selectedSubmodel.idShort, elementPath, currentValue)
    }

    return (
      <div className="p-4 space-y-6">
        <div className="space-y-3 pb-4 border-b">
          <div className="flex items-center gap-2">
            {getTypeBadge(selectedElement.modelType)}
            {getCardinalityBadge(selectedElement.cardinality)}
          </div>
          <h3 className="font-semibold text-lg">{selectedElement.idShort}</h3>
        </div>

        <div className="space-y-3 bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-green-800 dark:text-green-300 uppercase">
            Value {isRequired && <span className="text-red-500">*</span>}
          </h4>

          {selectedElement.modelType === "Property" && (
            <div>
              <input
                type="text"
                value={typeof selectedElement.value === 'string' ? selectedElement.value : ''}
                onChange={(e) => {
                  updateElementValue(selectedSubmodel.idShort, elementPath, e.target.value)
                }}
                placeholder={`Enter ${selectedElement.idShort}...`}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#61caf3] focus:border-transparent"
              />
            </div>
          )}

          {selectedElement.modelType === "MultiLanguageProperty" && (
            <div className="space-y-3">
              {typeof selectedElement.value === 'object' && selectedElement.value !== null && Object.entries(selectedElement.value).map(([lang, text]) => (
                <div key={lang} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Language: {lang === 'en' ? 'English' : lang === 'de' ? 'German' : lang === 'fr' ? 'French' : lang === 'es' ? 'Spanish' : lang === 'it' ? 'Italian' : lang} ({lang})
                    </label>
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => updateMLPLanguageValue(lang, e.target.value)}
                      placeholder={`Enter ${selectedElement.idShort} in ${lang}...`}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#61caf3] focus:border-transparent"
                    />
                  </div>
                  {lang !== 'en' && (
                    <button
                      onClick={() => removeLanguageFromMLP(lang)}
                      className="mt-6 p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600"
                      title="Remove language"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Add Language
                </label>
                <div className="flex gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addLanguageToMLP(e.target.value)
                        e.target.value = ''
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#61caf3] focus:border-transparent text-sm"
                  >
                    <option value="">Select language...</option>
                    <option value="de">German (de)</option>
                    <option value="fr">French (fr)</option>
                    <option value="es">Spanish (es)</option>
                    <option value="it">Italian (it)</option>
                    <option value="pt">Portuguese (pt)</option>
                    <option value="nl">Dutch (nl)</option>
                    <option value="pl">Polish (pl)</option>
                    <option value="ru">Russian (ru)</option>
                    <option value="zh">Chinese (zh)</option>
                    <option value="ja">Japanese (ja)</option>
                    <option value="ko">Korean (ko)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {(selectedElement.modelType === "SubmodelElementCollection" || 
            selectedElement.modelType === "SubmodelElementList") && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium mb-1">Collection Element</p>
              <p>This element contains child properties. Select its children in the tree to edit their values.</p>
            </div>
          )}

          {selectedElement.modelType === "File" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload a file (image, PDF, document) for this property.
              </p>
              
              <label className="block">
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={(e) => handleFileUpload(e, selectedSubmodel.idShort, elementPath)}
                    className="hidden"
                  />
                  <div className="w-full p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-[#61caf3] cursor-pointer flex flex-col items-center justify-center text-gray-400 hover:text-[#61caf3] bg-white dark:bg-gray-900 transition-all">
                    <Upload className="w-8 h-8 mb-2" />
                    <span className="text-sm">Click to upload file</span>
                    <span className="text-xs text-gray-500 mt-1">Images, PDFs, documents</span>
                  </div>
                </label>
              
              {selectedElement.fileData && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-green-600" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {selectedElement.fileData.fileName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {selectedElement.fileData.mimeType}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        updateElementMetadata(selectedSubmodel.idShort, elementPath, 'fileData', undefined)
                        updateElementValue(selectedSubmodel.idShort, elementPath, '')
                      }}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {selectedElement.fileData.mimeType.startsWith('image/') && (
                    <div className="mt-2 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                      <img
                        src={selectedElement.fileData.content || "/placeholder.svg"}
                        alt={selectedElement.fileData.fileName}
                        className="max-w-full max-h-48 object-contain mx-auto"
                      />
                    </div>
                  )}
                </div>
              )}
              
              {/* Manual path input as fallback */}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Or enter file path/URL manually:
                </label>
                <input
                  type="text"
                  value={typeof selectedElement.value === 'string' ? selectedElement.value : ''}
                  onChange={(e) => {
                    updateElementValue(selectedSubmodel.idShort, elementPath, e.target.value)
                  }}
                  placeholder="/files/manual-path.pdf or https://..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#61caf3] focus:border-transparent text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Metadata sections below value */}
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase">
              Property Metadata
            </h4>
            
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Type:
                </label>
                <div className="font-mono text-gray-900 dark:text-gray-100">
                  {selectedElement.modelType}
                </div>
              </div>
              
              {/* Reordered elements to match XSD: preferredName, shortName, unit, dataType, definition */}
              {/* Preferred Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Preferred Name (English):
                </label>
                <input
                  type="text"
                  value={typeof selectedElement.preferredName === 'string' 
                    ? selectedElement.preferredName 
                    : selectedElement.preferredName?.en || ''}
                  onChange={(e) => {
                    const currentPreferredName = selectedElement.preferredName || {};
                    const newValue = typeof currentPreferredName === 'string'
                      ? { en: e.target.value }
                      : { ...currentPreferredName, en: e.target.value };
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'preferredName', newValue)
                  }}
                  placeholder="Enter preferred name..."
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                />
              </div>
              
              {/* Short Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Short Name (English):
                </label>
                <input
                  type="text"
                  value={typeof selectedElement.shortName === 'string' 
                    ? selectedElement.shortName 
                    : selectedElement.shortName?.en || ''}
                  onChange={(e) => {
                    const currentShortName = selectedElement.shortName || {};
                    const newValue = typeof currentShortName === 'string'
                      ? { en: e.target.value }
                      : { ...currentShortName, en: e.target.value };
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'shortName', newValue)
                  }}
                  placeholder="Enter short name..."
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Unit:
                </label>
                <input
                  type="text"
                  value={selectedElement.unit || ''}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'unit', e.target.value)
                  }}
                  placeholder="mm, kg, °C, etc."
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                />
              </div>

              {/* Data Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Data Type:
                </label>
                <input
                  type="text"
                  value={selectedElement.dataType || ''}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'dataType', e.target.value)
                  }}
                  placeholder="STRING, INTEGER, BOOLEAN, etc."
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm font-mono"
                />
              </div>
              
              {/* Definition/Description (moved here for order) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Definition/Description:
                </label>
                <textarea
                  value={selectedElement.description || ''}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'description', e.target.value)
                  }}
                  placeholder="Enter property definition/description..."
                  rows={3}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                />
              </div>
              
              {/* Value Type (for Property) */}
              {(selectedElement.modelType === "Property" || selectedElement.valueType) && ( 
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Value Type:
                  </label>
                  <input
                    type="text"
                    value={selectedElement.valueType || ''}
                    onChange={(e) => {
                      updateElementMetadata(selectedSubmodel.idShort, elementPath, 'valueType', e.target.value)
                    }}
                    placeholder="xs:string, xs:integer, etc."
                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm font-mono"
                  />
                </div>
              )}
              
              {/* Category - Changed to dropdown */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Category:
                </label>
                <select
                  value={selectedElement.category || ''}
                  onChange={(e) => {
                    updateElementMetadata(selectedSubmodel.idShort, elementPath, 'category', e.target.value || undefined)
                  }}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                >
                  <option value="">None</option>
                  <option value="CONSTANT">CONSTANT</option>
                  <option value="PARAMETER">PARAMETER</option>
                  <option value="VARIABLE">VARIABLE</option>
                </select>
              </div>
              
              {/* Cardinality */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Cardinality:
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-900 dark:text-gray-100">
                    {selectedElement.cardinality}
                  </span>
                  <span className="text-xs text-gray-500">
                    {isRequired ? "(Required)" : "(Optional)"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase">
              Semantic ID (ECLASS/IEC61360)
            </h4>
            <input
              type="text"
              value={selectedElement.semanticId || ''}
              onChange={(e) => {
                updateElementMetadata(selectedSubmodel.idShort, elementPath, 'semanticId', e.target.value)
              }}
              placeholder="0173-1#02-AAO677#002 or https://..."
              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-xs font-mono"
            />
            {selectedElement.semanticId && selectedElement.semanticId.startsWith('http') && (
              <a
                href={selectedElement.semanticId}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
              >
                View specification →
              </a>
            )}
          </div>

          <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
              Definition/Description
            </h4>
            <textarea
              value={selectedElement.description || ''}
              onChange={(e) => {
                updateElementMetadata(selectedSubmodel.idShort, elementPath, 'description', e.target.value)
              }}
              placeholder="Enter property definition/description..."
              rows={3}
              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
            />
          </div>
          
          {/* Removed Source of Definition input */}
        </div>
      </div>
    )
  }

  // New type to store collected concept descriptions
  type ConceptDescription = {
    id: string;
    idShort: string;
    preferredName?: Record<string, string>;
    shortName?: Record<string, string>;
    description?: string;
    dataType?: string;
    unit?: string;
    category?: string;
    valueType?: string; // For properties
  };

  const generateFinalAAS = async () => {
    setIsGenerating(true)
    
    // Helper to prefix XML schema types for valueType
    const prefixXs = (type: string | undefined) => {
      if (!type) return undefined;
      const commonTypes = ['string', 'integer', 'boolean', 'float', 'double', 'date', 'dateTime', 'time', 'anyURI', 'base64Binary', 'hexBinary', 'decimal', 'byte', 'short', 'int', 'long', 'unsignedByte', 'unsignedShort', 'unsignedInt', 'unsignedLong', 'duration', 'gDay', 'gMonth', 'gMonthDay', 'gYear', 'gYearMonth'];
      return commonTypes.includes(type) && !type.startsWith('xs:') ? `xs:${type}` : type;
    };

    try {
      // Validate before generating
      const internalValidation = validateAAS()
      
      if (!internalValidation.valid) {
        alert(`Please fill in all required fields before downloading:\n\n${internalValidation.missingFields.join('\n')}`)
        console.table(internalValidation.missingFields); // Log internal validation errors
        setIsGenerating(false)
        return
      }

      // Clear internal validation errors after successful validation
      setValidationErrors(new Set())

      // Collect all unique concept descriptions
      const collectedConceptDescriptions: Record<string, ConceptDescription> = {};

      const collectConcepts = (elements: SubmodelElement[]) => {
        elements.forEach(element => {
          if (element.semanticId) {
            const conceptId = element.semanticId;
            if (!collectedConceptDescriptions[conceptId]) {
              // Use idShort from the element as a fallback for concept description idShort
              const conceptIdShort = element.idShort; 
              collectedConceptDescriptions[conceptId] = {
                id: conceptId,
                idShort: conceptIdShort, // Use element's idShort as concept's idShort
                preferredName: typeof element.preferredName === 'string' ? { en: element.preferredName } : element.preferredName,
                shortName: typeof element.shortName === 'string' ? { en: element.shortName } : element.shortName,
                description: element.description,
                dataType: element.dataType,
                unit: element.unit,
                category: element.category,
                valueType: element.valueType,
              };
            }
          }
          if (element.children) {
            collectConcepts(element.children);
          }
        });
      };

      aasConfig.selectedSubmodels.forEach(sm => {
        const elements = submodelData[sm.idShort] || [];
        collectConcepts(elements);
      });

      const generateElementXml = (element: SubmodelElement, indent: string): string => {
        const tagName = element.modelType === "Property" ? "property" :
                        element.modelType === "MultiLanguageProperty" ? "multiLanguageProperty" :
                        element.modelType === "SubmodelElementCollection" ? "submodelElementCollection" :
                        element.modelType === "SubmodelElementList" ? "submodelElementList" :
                        element.modelType === "File" ? "file" : "property"
        
        console.log(`[v0] XML_GEN_DEBUG: Processing element: ${element.idShort}, modelType: ${element.modelType}, tagName: ${tagName}`);

        let xml = `${indent}<${tagName}>\n`
        xml += `${indent}  <idShort>${element.idShort}</idShort>\n`
        
        if (element.semanticId) {
          xml += `${indent}  <semanticId>\n`
          xml += `${indent}    <type>ExternalReference</type>\n`
          xml += `${indent}    <keys>\n`
          xml += `${indent}      <key>\n`
          xml += `${indent}        <type>GlobalReference</type>\n`
          xml += `${indent}        <value>${element.semanticId}</value>\n`
          xml += `${indent}      </key>\n`
          xml += `${indent}    </keys>\n`
          xml += `${indent}  </semanticId>\n`
        }

        // Value generation logic - ensure no <value> for collections/lists
        if (element.modelType === "Property") {
          const prefixedValueType = prefixXs(element.valueType || 'string');
          xml += `${indent}  <valueType>${prefixedValueType}</valueType>\n`
          if (typeof element.value === 'string' && element.value) {
            xml += `${indent}  <value>${element.value}</value>\n`
            console.log(`[v0] XML_GEN_DEBUG:   Generated <value> for Property ${element.idShort}`);
          }
        } else if (element.modelType === "MultiLanguageProperty") {
          const hasLangValues = typeof element.value === 'object' && element.value !== null && Object.values(element.value).some(text => text && String(text).trim() !== '');
          if (hasLangValues) {
            xml += `${indent}  <value>\n`
            Object.entries(element.value!).forEach(([lang, text]) => {
              if (text && String(text).trim() !== '') {
                xml += `${indent}    <langStringTextType>\n`
                xml += `${indent}      <language>${lang}</language>\n`
                xml += `${indent}      <text>${text}</text>\n`
                xml += `${indent}            </langStringTextType>\n`
              }
            })
            xml += `${indent}  </value>\n`
            console.log(`[v0] XML_GEN_DEBUG:   Generated <value> for MLP ${element.idShort}`);
          }
        } else if (element.modelType === "File") {
          if (typeof element.value === 'string' && element.value) {
            xml += `${indent}  <value>${element.value}</value>\n`
            xml += `${indent}  <contentType>${element.fileData?.mimeType || 'application/octet-stream'}</contentType>\n` // Use actual mimeType
            console.log(`[v0] XML_GEN_DEBUG:   Generated <value> for File ${element.idShort}`);
          }
        } else if (element.modelType === "SubmodelElementCollection" || element.modelType === "SubmodelElementList") {
          // This block handles children directly, NO <value> tag is generated here.
          console.log(`[v0] XML_GEN_DEBUG:   Processing children for Collection/List ${element.idShort}`);
          if (element.children && element.children.length > 0) {
            element.children.forEach(child => {
              xml += generateElementXml(child, indent + "  ")
            })
          }
        } else {
          console.log(`[v0] XML_GEN_DEBUG:   No value/children logic for modelType: ${element.modelType} for ${element.idShort}`);
        }
        
        xml += `${indent}</${tagName}>\n`
        return xml
      }

      let defaultThumbnailXml = '';
      let thumbnailFileName = '';
      let thumbnailMimeType = '';

      if (thumbnail) {
        const mimeTypeMatch = thumbnail.match(/^data:(image\/(png|jpeg|gif|svg\+xml));base64,/)
        if (mimeTypeMatch) {
          thumbnailMimeType = mimeTypeMatch[1];
          const extension = mimeTypeMatch[2] === 'svg+xml' ? 'svg' : mimeTypeMatch[2];
          thumbnailFileName = `thumbnail.${extension}`;
          defaultThumbnailXml = `        <defaultThumbnail>
          <path>${thumbnailFileName}</path>
          <contentType>${thumbnailMimeType}</contentType>
        </defaultThumbnail>\n`;
        }
      }

      const aasXml = `<?xml version="1.0" encoding="UTF-8"?>
<environment xmlns="https://admin-shell.io/aas/3/1"> <!-- Updated namespace to 3/1 -->
  <assetAdministrationShells>
    <assetAdministrationShell>
      <idShort>${aasConfig.idShort}</idShort>
      <id>${aasConfig.id}</id>
      <assetInformation>
        <assetKind>${aasConfig.assetKind}</assetKind>
        <globalAssetId>${aasConfig.globalAssetId}</globalAssetId>
${defaultThumbnailXml}      </assetInformation>
      <submodels>
${aasConfig.selectedSubmodels.map(sm => `        <reference>
          <type>ModelReference</type>
          <keys>
            <key>
              <type>Submodel</type>
              <value>${aasConfig.id}/submodels/${sm.idShort}</value>
            </key>
          </keys>
        </reference>`).join('\n')}
      </submodels>
    </assetAdministrationShell>
  </assetAdministrationShells>
  <submodels>
${aasConfig.selectedSubmodels.map(sm => {
        const elements = submodelData[sm.idShort] || []
        return `    <submodel>
      <idShort>${sm.idShort}</idShort>
      <id>${aasConfig.id}/submodels/${sm.idShort}</id>
      <kind>Instance</kind>
      <semanticId>
        <type>ExternalReference</type>
        <keys>
          <key>
            <type>GlobalReference</type>
            <value>${sm.template.url || 'https://admin-shell.io/submodels/' + sm.idShort}</value>
          </key>
        </keys>
      </semanticId>
      <submodelElements>
${elements.map(el => generateElementXml(el, "        ")).join('')}      </submodelElements>
    </submodel>`
      }).join('\n')}
  </submodels>
  <conceptDescriptions>
${Object.values(collectedConceptDescriptions).map(concept => {
    const indent = "    ";
    const prefixedValueType = concept.valueType ? prefixXs(concept.valueType) : undefined;
    return `${indent}<conceptDescription>
${indent}  <idShort>${concept.idShort}</idShort>
${indent}  <id>${concept.id}</id>
${indent}  <embeddedDataSpecifications>
${indent}    <embeddedDataSpecification>
${indent}      <dataSpecification>
${indent}        <type>ExternalReference</type>
${indent}        <keys>
${indent}          <key>
${indent}            <type>GlobalReference</type>
${indent}            <value>https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360</value>
${indent}          </key>
${indent}        </keys>
${indent}      </dataSpecification>
${indent}      <dataSpecificationContent>
${indent}        <dataSpecificationIec61360>
${concept.preferredName ? `${indent}          <preferredName>
${Object.entries(concept.preferredName).map(([lang, text]) => text ? `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>${lang}</language>
${indent}              <text>${text}</text>
${indent}            </langStringPreferredNameTypeIec61360>` : '').join('\n')}
${indent}          </preferredName>\n` : ''}
${concept.shortName ? `${indent}          <shortName>
${Object.entries(concept.shortName).map(([lang, text]) => text ? `${indent}            <langStringShortNameTypeIec61360>
${indent}              <language>${lang}</language>
${indent}              <text>${text}</text>
${indent}            </langStringShortNameTypeIec61360>` : '').join('\n')}
${indent}          </shortName>\n` : ''}
${concept.unit ? `${indent}          <unit>${concept.unit}</unit>\n` : ''}
${concept.dataType ? `${indent}          <dataType>${concept.dataType}</dataType>\n` : ''}
${concept.description ? `${indent}          <definition>
${indent}            <langStringDefinitionTypeIec61360>
${indent}              <language>en</language>\n` : ''}
${concept.description ? `${indent}              <text>${concept.description}</text>\n` : ''}
${concept.description ? `${indent}            </langStringDefinitionTypeIec61360>
${indent}          </definition>\n` : ''}
${concept.category ? `${indent}          <value>${concept.category}</value>\n` : ''}
${prefixedValueType ? `${indent}          <valueType>${prefixedValueType}</valueType>\n` : ''}
${indent}        </dataSpecificationIec61360>
${indent}      </dataSpecificationContent>
${indent}    </embeddedDataSpecification>
${indent}  </embeddedDataSpecifications>
${indent}</conceptDescription>`
  }).join('\n')}
  </conceptDescriptions>
</environment>`

      // Perform XML schema validation
      console.log("[v0] EDITOR: Starting XML schema validation for generated AAS...")
      const xmlValidationResult = await validateAASXXml(aasXml)

      if (!xmlValidationResult.valid) {
        alert(`Generated AAS XML is invalid:\n\n${xmlValidationResult.errors.join('\n')}`)
        console.table(xmlValidationResult.errors); // Log external validation errors
        setIsGenerating(false)
        return
      }
      console.log("[v0] EDITOR: XML schema validation PASSED.")

      // Create AASX file (ZIP format)
      try {
        const zip = new JSZip()
        
        // Add the main AAS XML file
        const xmlFileName = `${aasConfig.idShort}.xml`
        zip.file(xmlFileName, aasXml)
        
        const addFilesFromElements = (elements: SubmodelElement[]) => {
          elements.forEach(element => {
            if (element.modelType === "File" && element.fileData) {
              // Convert base64 data URL to blob
              const base64Data = element.fileData.content.split(',')[1]
              const binaryData = atob(base64Data)
              const arrayBuffer = new ArrayBuffer(binaryData.length)
              const uint8Array = new Uint8Array(arrayBuffer)
              for (let i = 0; i < binaryData.length; i++) {
                uint8Array[i] = binaryData.charCodeAt(i)
              }
              
              // Add file to /files directory in AASX
              zip.file(`files/${element.fileData.fileName}`, uint8Array)
            }
            
            // Recursively check children
            if (element.children) {
              addFilesFromElements(element.children)
            }
          })
        }
        
        // Add all files from all submodels
        aasConfig.selectedSubmodels.forEach(sm => {
          const elements = submodelData[sm.idShort] || []
          addFilesFromElements(elements)
        })
        
        if (thumbnail && thumbnailFileName) {
          // Convert base64 data URL to blob
          const base64Data = thumbnail.split(',')[1]
          const binaryData = atob(base64Data)
          const arrayBuffer = new ArrayBuffer(binaryData.length)
          const uint8Array = new Uint8Array(arrayBuffer)
          for (let i = 0; i < binaryData.length; i++) {
            uint8Array[i] = binaryData.charCodeAt(i)
          }
          
          zip.file(thumbnailFileName, uint8Array) // Add thumbnail to root of AASX
        }
        
        // Add aasx-origin file (required for AASX structure)
        zip.file("aasx/aasx-origin", `<?xml version="1.0" encoding="UTF-8"?>
<origin xmlns="http://admin-shell.io/aasx/relationships/aasx-origin">
  <originPath>/${xmlFileName}</originPath>
</origin>`)
        
        // Add relationships file
        zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="aasx-origin" Type="http://admin-shell.io/aasx/relationships/aasx-origin" Target="/aasx/aasx-origin"/>
</Relationships>`)
        
        // Generate ZIP file
        const blob = await zip.generateAsync({ type: "blob" })
        
        console.log("[v0] AASX file generated successfully")
        
        if (onFileGenerated) {
          // Create a File object from the blob so it can be parsed like a regular upload
          const aasxFile = new File([blob], `${aasConfig.idShort}.aasx`, { type: "application/octet-stream" })
          
          // Pass the File object which will be properly parsed by data-uploader
          onFileGenerated({
            file: aasxFile.name, // Use file.name for consistency with ValidationResult
            type: "AASX",
            valid: true,
            processingTime: 0, // Placeholder
            parsed: null, // No direct parsed content for AASX blob
            aasData: null, // No direct AASData for AASX blob
            thumbnail: thumbnail || undefined,
          })
        }
        
        // Download the AASX file
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${aasConfig.idShort}.aasx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
      } catch (error) {
        console.error("[v0] Error generating AASX file:", error)
        alert("Failed to generate AASX file. Please try again.")
      }
    } catch (error) {
      console.error("[v0] Error generating AASX file:", error)
      alert("Failed to generate AASX file. Please try again.")
    } finally {
      setIsGenerating(false)
    }
    }

  const validateAAS = (): { valid: boolean; missingFields: string[] } => {
    const missingFields: string[] = []
    const errors: Set<string> = new Set()
    const nodesToExpand: Set<string> = new Set()
    
    const validateElements = (elements: SubmodelElement[], submodelId: string, path: string[] = []) => {
      elements.forEach(element => {
        const currentPath = [...path, element.idShort]
        const nodeId = currentPath.join('.')
        const isRequired = element.cardinality === "One" || element.cardinality === "OneToMany"
        
        if (isRequired) {
          let hasValue = false
          
          if (element.modelType === "Property") {
            hasValue = typeof element.value === 'string' && element.value.trim() !== ''
          } else if (element.modelType === "MultiLanguageProperty") {
            if (typeof element.value === 'object' && element.value !== null) {
              const values = Object.values(element.value).filter(v => v && v.trim() !== '')
              hasValue = values.length > 0
            }
          } else if (element.modelType === "SubmodelElementCollection" || element.modelType === "SubmodelElementList") {
            // For collections, check if they have children (structure requirement)
            hasValue = (element.children && element.children.length > 0)
          }
          
          if (!hasValue && (element.modelType === "Property" || element.modelType === "MultiLanguageProperty" || element.modelType === "SubmodelElementCollection" || element.modelType === "SubmodelElementList")) {
            missingFields.push(`${submodelId} > ${currentPath.join(' > ')}`)
            errors.add(nodeId)
            
            for (let i = 0; i < currentPath.length - 1; i++) {
              const parentPath = currentPath.slice(0, i + 1).join('.')
              nodesToExpand.add(parentPath)
            }
          }
        }
        
        // Recursively validate children
        if (element.children && element.children.length > 0) {
          validateElements(element.children, submodelId, currentPath)
        }
      })
    }
    
    // Validate all submodels
    aasConfig.selectedSubmodels.forEach(sm => {
      const elements = submodelData[sm.idShort] || []
      validateElements(elements, sm.idShort)
    })
    
    setValidationErrors(errors)
    setExpandedNodes(prev => new Set([...prev, ...nodesToExpand]))
    
    return {
      valid: missingFields.length === 0,
      missingFields
    }
  }

  const addSubmodel = async (template: SubmodelTemplate) => {
    const newSubmodel: SelectedSubmodel = {
      template,
      idShort: template.name.replace(/\s+/g, '')
    }
    
    const fetchedStructure = await fetchTemplateDetails(template.name)
    const structure = fetchedStructure || generateTemplateStructure(template.name)
    
    // Create a new AASConfig object with the updated selectedSubmodels array
    const updatedSelectedSubmodels = [...aasConfig.selectedSubmodels, newSubmodel];
    const newAASConfig = { ...aasConfig, selectedSubmodels: updatedSelectedSubmodels };
    
    onUpdateAASConfig(newAASConfig); // Call the callback to update parent state

    setSubmodelData(prev => ({
      ...prev,
      [newSubmodel.idShort]: structure
    }))
    setShowAddSubmodel(false)
    setSelectedSubmodel(newSubmodel)
  }

  const removeSubmodel = (idShort: string) => {
    const index = aasConfig.selectedSubmodels.findIndex(sm => sm.idShort === idShort)
    if (index !== -1) {
      // Create a new AASConfig object without the removed submodel
      const updatedSelectedSubmodels = aasConfig.selectedSubmodels.filter(sm => sm.idShort !== idShort);
      const newAASConfig = { ...aasConfig, selectedSubmodels: updatedSelectedSelectedSubmodels };
      
      onUpdateAASConfig(newAASConfig); // Call the callback to update parent state

      const newData = { ...submodelData }
      delete newData[idShort]
      setSubmodelData(newData)
      
      if (selectedSubmodel?.idShort === idShort) {
        setSelectedSubmodel(aasConfig.selectedSubmodels[0] || null)
        setSelectedElement(null)
      }
    }
  }

  const deleteElement = (submodelId: string, path: string[]) => {
    setSubmodelData((prev) => {
      const newData = { ...prev }
      const deleteFromElements = (elements: SubmodelElement[], currentPath: string[]): SubmodelElement[] => {
        if (currentPath.length === 1) {
          // Delete at this level
          return elements.filter(el => el.idShort !== currentPath[0])
        }
        
        const [current, ...rest] = currentPath
        return elements.map(el => {
          if (el.idShort === current && el.children) {
            return { ...el, children: deleteFromElements(el.children, rest) }
          }
          return el
        })
      }
      
      newData[submodelId] = deleteFromElements(newData[submodelId], path)
      return newData
    })
    
    // Clear selection if deleted element was selected
    if (selectedElement && path[path.length - 1] === selectedElement.idShort) {
      setSelectedElement(null)
    }
  }

  const canDelete = (cardinality: string): boolean => {
    return cardinality === "ZeroToOne" || cardinality === "ZeroToMany"
  }

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setThumbnail(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ""
  }

  const filteredTemplates = availableTemplates.filter(template =>
    template.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
    template.description.toLowerCase().includes(templateSearchQuery.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Edit AAS: {aasConfig.idShort}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Fill in the values for your Asset Administration Shell
              <span className="ml-2 text-red-600">* = Required field</span>
            </p>
          </div>
        </div>
        <button
          onClick={generateFinalAAS}
          disabled={isGenerating}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              Download AAS
            </>
          )}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Submodels */}
        <div className="w-64 border-r border-gray-200 dark:border-gray-700 overflow-y-auto" 
             style={{ backgroundColor: "rgba(97, 202, 243, 0.1)" }}>
          <div className="p-4 space-y-2">
            {/* AAS Thumbnail Upload Section */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                AAS Thumbnail
              </label>
              {thumbnail ? (
                <div className="relative">
                  <div className="w-full h-[150px] rounded-lg border-2 border-[#61caf3] shadow-md overflow-hidden flex items-center justify-center bg-white">
                    <img
                      src={thumbnail || "/placeholder.svg"}
                      alt="AAS Thumbnail"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <button
                    onClick={() => setThumbnail(null)}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    title="Remove thumbnail"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailUpload}
                    className="hidden"
                  />
                  <div className="w-full h-[150px] rounded-lg border-2 border-dashed border-[#adadae] hover:border-[#61caf3] cursor-pointer flex flex-col items-center justify-center text-gray-400 hover:text-[#61caf3] bg-white transition-all">
                    <Upload className="w-8 h-8 mb-2" />
                    <span className="text-xs">Upload thumbnail</span>
                  </div>
                </label>
              )}
            </div>

            <button
              onClick={() => {
                loadTemplates()
                setShowAddSubmodel(true)
              }}
              className="w-full p-3 rounded-lg border-2 border-dashed border-[#61caf3] hover:bg-white/50 transition-all flex flex-col items-center gap-2"
            >
              <Plus className="w-5 h-5 text-[#61caf3]" />
              <span className="text-xs text-[#61caf3] font-medium">Add Submodel</span>
            </button>

            {aasConfig.selectedSubmodels.map((sm, idx) => {
              const elements = submodelData[sm.idShort] || []
              const isSelected = selectedSubmodel?.idShort === sm.idShort
              
              return (
                <div
                  key={idx}
                  className="p-3 rounded-lg cursor-pointer transition-all flex flex-col items-center gap-2 relative group"
                  style={{
                    border: isSelected ? "1px solid #61caf3" : "1px solid #adadae",
                    backgroundColor: isSelected ? "white" : "transparent"
                  }}
                  onClick={() => {
                    setSelectedSubmodel(sm)
                    setSelectedElement(null)
                    setExpandedNodes(new Set())
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSubmodel(sm.idShort)
                    }}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>

                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: isSelected ? "#61caf3" : "#adadae" }}
                  >
                    <FileText className="w-5 h-5" />
                  </div>
                  <span
                    className="text-xs text-center truncate w-full"
                    style={{ color: isSelected ? "#61caf3" : "#adadae", fontWeight: isSelected ? 600 : 400 }}
                    title={sm.idShort}
                  >
                    {sm.idShort}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Middle Panel - Tree Structure */}
        <div className="flex-1 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-4">
            {selectedSubmodel ? (
              <>
                <div className="flex items-center justify-between mb-4 pb-3 border-b">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-[#61caf3] text-white text-xs font-semibold rounded">
                      SM
                    </span>
                    <span className="font-semibold">{selectedSubmodel.idShort}</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {submodelData[selectedSubmodel.idShort]?.length || 0} elements
                  </span>
                </div>
                {submodelData[selectedSubmodel.idShort]?.map((element, idx) =>
                  renderTreeNode(element, 0, [element.idShort], idx, submodelData[selectedSubmodel.idShort])
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a submodel to view its structure
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Editable Fields */}
        <div className="w-96 overflow-y-auto bg-gray-50 dark:bg-gray-800">
          {renderEditableDetails()}
        </div>
      </div>

      {/* Submodel selection dialog */}
      {showAddSubmodel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[600px] max-h-[600px] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add Submodel Template</h3>
              <button
                onClick={() => {
                  setShowAddSubmodel(false)
                  setSearchQuery("")
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b">
              <input
                type="text"
                placeholder="Search submodels..."
                value={templateSearchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 focus:ring-2 focus:ring-[#61caf3] focus:border-transparent"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingTemplates ? (
                <div className="text-center py-8 text-gray-500">Loading templates...</div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No templates found matching "{templateSearchQuery}"</div>
              ) : (
                <div className="space-y-2">
                  {filteredTemplates.map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        addSubmodel(template)
                        setSearchQuery("")
                      }}
                      className="w-full p-3 text-left border rounded-lg hover:border-[#61caf3] hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                    >
                      <div className="font-medium">{template.name}</div>
                      <div className="text-sm text-gray-500">{template.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}