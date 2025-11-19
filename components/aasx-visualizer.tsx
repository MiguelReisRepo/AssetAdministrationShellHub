"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { ChevronRight, ChevronDown, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import type { ValidationResult } from "@/lib/types" // Import ValidationResult type
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible" // Import Collapsible components

interface AASXVisualizerProps {
  uploadedFiles: ValidationResult[] // Use ValidationResult type
  newFileIndex?: number | null
  onFileSelected?: () => void
}

export function AASXVisualizer({ uploadedFiles, newFileIndex, onFileSelected }: AASXVisualizerProps) {
  const [aasxData, setAasxData] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<ValidationResult | null>(null) // Use ValidationResult type
  const [selectedSubmodel, setSelectedSubmodel] = useState<any>(null)
  const [selectedElement, setSelectedElement] = useState<any>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set()) // Corrected initialization
  const [hideEmptyElements, setHideEmptyElements] = useState(false)

  useEffect(() => {
    if (newFileIndex !== null && newFileIndex >= 0 && uploadedFiles[newFileIndex]) {
      setSelectedFile(uploadedFiles[newFileIndex])
      onFileSelected?.()
    } else if (uploadedFiles.length > 0 && !selectedFile) {
      setSelectedFile(uploadedFiles[0])
    }
  }, [uploadedFiles, selectedFile, newFileIndex, onFileSelected])

  useEffect(() => {
    if (!selectedFile) return

    // Ensure content is parsed AASXData structure
    if (selectedFile.aasData && selectedFile.aasData.submodels) { // Use aasData from ValidationResult
      setAasxData(selectedFile.aasData)
      setSelectedSubmodel(selectedFile.aasData.submodels[0])
    } else {
      // Fallback if content is not in expected AASXData format
      setAasxData({ idShort: selectedFile.file, submodels: [] }) // Use file.name for idShort
      setSelectedSubmodel(null)
    }
  }, [selectedFile])

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const getElementType = (element: any): string => {
    if (!element?.modelType) return "Property"
    return element.modelType
  }

  const getTypeBadge = (type: string, inverted = false) => {
    const badgeMap: Record<string, { label: string; classes: string }> = {
      SubmodelElementCollection: {
        label: "SMC",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-smc" : "aasx-badge aasx-badge-smc",
      },
      Property: {
        label: "Prop",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-prop" : "aasx-badge aasx-badge-prop",
      },
      MultiLanguageProperty: {
        label: "MLP",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-mlp" : "aasx-badge aasx-badge-mlp",
      },
      File: {
        label: "File",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-file" : "aasx-badge aasx-badge-file",
      },
      Operation: {
        label: "Op",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-op" : "aasx-badge aasx-badge-op",
      },
      SubmodelElementList: {
        label: "SML",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-smc" : "aasx-badge aasx-badge-smc",
      },
      BasicEventElement: {
        label: "Evt",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-evt" : "aasx-badge aasx-badge-evt",
      },
      Blob: {
        label: "Blob",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-blob" : "aasx-badge aasx-badge-blob",
      },
      Range: {
        label: "Range",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-range" : "aasx-badge aasx-badge-range",
      },
      ReferenceElement: {
        label: "Ref",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-ref" : "aasx-badge aasx-badge-ref",
      },
      Entity: {
        label: "Entity",
        classes: inverted
          ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-entity"
          : "aasx-badge aasx-badge-entity",
      },
      Capability: {
        label: "Cap",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-cap" : "aasx-badge aasx-badge-cap",
      },
      RelationshipElement: {
        label: "Rel",
        classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-rel" : "aasx-badge aasx-badge-rel",
      },
      AnnotatedRelationshipElement: {
        label: "AnnRel",
        classes: inverted
          ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-annrel"
          : "aasx-badge aasx-badge-annrel",
      },
    }
    const badge = badgeMap[type] || {
      label: "Node",
      classes: inverted ? "aasx-badge aasx-badge-inverted aasx-badge-inverted-node" : "aasx-badge aasx-badge-node",
    }
    return <span className={badge.classes}>{badge.label}</span>
  }

  const hasChildren = (element: any): boolean => {
    // MultiLanguageProperty values are objects with language keys, but shouldn't show as children
    if (element?.modelType === 'MultiLanguageProperty') {
      return false
    }
    // Check for the 'value' property for collections/lists in the parsed structure
    return Array.isArray(element?.value) && element.value.length > 0
  }

  const hasValue = (element: any): boolean => {
    if (!element) return false
    
    const type = getElementType(element)
    
    // Collections and Lists are considered to have value if they have children
    if (type === "SubmodelElementCollection" || type === "SubmodelElementList") {
      return hasChildren(element)
    }
    
    // MultiLanguageProperty
    if (type === "MultiLanguageProperty") {
      if (Array.isArray(element.value) && element.value.length > 0) {
        return element.value.some((item: any) => item && item.text)
      }
      // This branch might be deprecated if parser always returns array, but keep for robustness
      if (typeof element.value === "object" && element.value !== null) {
        return Object.keys(element.value).length > 0
      }
    }
    
    // Other types: check if value exists and is not empty
    return element.value !== undefined && element.value !== null && element.value !== ""
  }

  const hasVisibleChildren = (element: any): boolean => {
    if (!hasChildren(element)) return false
    
    const children = element.value || [] // Use element.value for children
    return children.some((child: any) => shouldShowElement(child))
  }

  const shouldShowElement = (element: any): boolean => {
    if (!element || typeof element !== "object") return false
    if (!hideEmptyElements) return true

    const type = getElementType(element)
    
    // For collections and lists, check if they have visible children after filtering
    if (type === "SubmodelElementCollection" || type === "SubmodelElementList") {
      return hasVisibleChildren(element)
    }
    
    // For other elements, check if they have a value
    return hasValue(element)
  }

  const renderTreeNode = (element: any, depth = 0, path = ""): React.ReactNode => {
    if (!element || typeof element !== "object") return null
    
    if (!shouldShowElement(element)) {
      return null
    }

    const nodeId = `${path}-${element.idShort || "node"}`
    const isExpanded = expandedNodes.has(nodeId)
    const isSelected = selectedElement === element
    const type = getElementType(element)
    const children = hasChildren(element) ? element.value : [] // Use element.value for children
    const hasKids = children.length > 0

    const getNodeHeaderClass = () => {
      if (isSelected) {
        if (depth === 0 && hasKids && isExpanded) {
          return "aasx-tree-node-header aasx-tree-node-header-selected-root-expanded"
        }
        if (depth > 0 && hasKids && isExpanded) {
          return "aasx-tree-node-header aasx-tree-node-header-selected-child-expanded"
        }
        return "aasx-tree-node-header aasx-tree-node-header-selected"
      }
      if (hasKids && isExpanded) {
        return "aasx-tree-node-header aasx-tree-node-header-expanded-top"
      }
      return "aasx-tree-node-header aasx-tree-node-header-default"
    }

    const getDisplayValueForTreeNode = () => {
      const type = getElementType(element);
      if (type === "Property" || type === "File") {
        return element.value ? String(element.value) : null;
      }
      if (type === "MultiLanguageProperty") {
        if (Array.isArray(element.value)) {
          const enText = element.value.find((item: any) => item && item.language === 'en')?.text;
          const firstText = element.value[0]?.text;
          return enText || firstText || null;
        }
      }
      return null;
    };

    const displayValue = getDisplayValueForTreeNode()
    const indentStyle = { paddingLeft: hasKids ? `${depth * 20}px` : "0px" }

    return (
      <div key={nodeId} style={{ marginLeft: depth > 0 ? "0px" : "0" }}>
        <div
          className={getNodeHeaderClass()}
          style={indentStyle}
          onClick={() => {
            setSelectedElement(element)
            if (hasKids) toggleNode(nodeId)
          }}
        >
          <div className="aasx-tree-node-expand-icon">
            {hasKids && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  toggleNode(nodeId)
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-green-600" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-green-600" />
                )}
              </span>
            )}
          </div>
          <div className="aasx-tree-node-content">
            {getTypeBadge(type)}
            <div className="aasx-tree-node-info">
              <div className="aasx-tree-node-label-container">
                <span className={`aasx-tree-node-label ${element.idShort ? "aasx-tree-node-label-bold" : ""}`}>
                  {element.idShort || "Element"}
                </span>
                {displayValue && (
                  <span className="aasx-tree-node-value">
                    = {String(displayValue).substring(0, 50)}
                    {String(displayValue).length > 50 ? "..." : ""}
                  </span>
                )}
              </div>
              {hasKids && (
                <span className="aasx-tree-node-element-count">
                  {children.length} element{children.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>
        {isExpanded && hasKids && (
          <div className="aasx-tree-children-wrapper" style={indentStyle}>
            {children.map((child: any, idx: number) => renderTreeNode(child, depth + 1, `${nodeId}-${idx}`))}
          </div>
        )}
      </div>
    )
  }

  const renderDetails = () => {
    if (!selectedFile) {
      return <div className="aasx-no-selection-message">Upload a file to view details</div>
    }

    if (!selectedElement) {
      return <div className="aasx-no-selection-message">Select an element to view details</div>
    }

    const type = getElementType(selectedElement)
    const isCollection = type === "SubmodelElementCollection" || type === "SubmodelElementList"

    const typeColorMap: Record<string, string> = {
      SubmodelElementCollection: "#61caf3",
      Property: "#6662b4",
      MultiLanguageProperty: "#ffa500",
      File: "#10b981",
      SubmodelElementList: "#10b981",
      BasicEventElement: "#9e005d",
      Blob: "#8b5cf6",
      Operation: "#f59e0b",
      Range: "#ec4899",
      ReferenceElement: "#14b8a6",
      Entity: "#f97316",
      Capability: "#a855f7",
      RelationshipElement: "#06b6d4",
      AnnotatedRelationshipElement: "#0891b2",
    }
    const typeColor = typeColorMap[type] || "#1793b8"

    const hexToRgba = (hex: string, opacity: number) => {
      const r = Number.parseInt(hex.slice(1, 3), 16)
      const g = Number.parseInt(hex.slice(3, 5), 16)
      const b = Number.parseInt(hex.slice(5, 7), 16)
      return `rgba(${r}, ${g}, ${b}, ${opacity})`
    }

    const getSemanticIdValue = (): string => {
      if (!selectedElement.semanticId) {
        return "N/A"
      }
      
      // Handle string semanticId
      if (typeof selectedElement.semanticId === 'string') {
        return selectedElement.semanticId
      }
      
      // Handle object with keys array
      if (selectedElement.semanticId.keys && Array.isArray(selectedElement.semanticId.keys)) {
        const key = selectedElement.semanticId.keys[0]
        if (key && key.value) {
          return String(key.value)
        }
      }
      
      // Handle object with direct value property
      if (selectedElement.semanticId.value) {
        return String(selectedElement.semanticId.value)
      }
      
      return "N/A"
    }

    const getDetailValue = () => {
      if (type === "MultiLanguageProperty") {
        if (Array.isArray(selectedElement.value)) {
          // Return the array to display individual language entries
          return selectedElement.value
        }
        return []
      }
      
      if (isCollection) { // Check if it's a collection or list
        return `Collection (${selectedElement.value?.length || 0} items)`
      }
      
      if (type === "BasicEventElement") {
        return "Event Element"
      }
      return selectedElement.value || "N/A"
    }

    const getDescriptionText = (): string => {
      if (!selectedElement.description) {
        return "N/A"
      }
      
      if (typeof selectedElement.description === "string") {
        return selectedElement.description
      }
      
      if (Array.isArray(selectedElement.description)) {
        const enDesc = selectedElement.description.find((d: any) => d.language === 'en')
        const result = enDesc?.text || selectedElement.description[0]?.text || "N/A"
        return result
      }
      
      if (typeof selectedElement.description === "object") {
        const entries = Object.entries(selectedElement.description)
        if (entries.length > 0) {
          const enValue = (selectedElement.description as any).en
          if (enValue) {
            return String(enValue)
          }
          return String(entries[0][1])
        }
      }
      
      return "N/A"
    }

    const getStringValue = (field: any, preferredLang: string = 'en'): string => {
      if (!field) {
        return ""
      }
      if (typeof field === 'string') {
        return field
      }
      if (typeof field === 'object') {
        if (field[preferredLang]) {
          return String(field[preferredLang])
        }
        const entries = Object.entries(field)
        if (entries.length > 0) {
          return String(entries[0][1])
        }
      }
      return ""
    }

    const semanticIdValue = getSemanticIdValue()
    const descriptionText = getDescriptionText()
    
    const preferredNameValue = getStringValue(selectedElement.embeddedDataSpecifications?.[0]?.dataSpecificationContent?.preferredName?.langStringPreferredNameTypeIec61360?.[0]?.text || selectedElement.preferredName)
    const shortNameValue = getStringValue(selectedElement.embeddedDataSpecifications?.[0]?.dataSpecificationContent?.shortName?.langStringShortNameTypeIec61360?.[0]?.text || selectedElement.shortName)
    const dataTypeValue = selectedElement.embeddedDataSpecifications?.[0]?.dataSpecificationContent?.dataType || selectedElement.dataType
    const unitValue = selectedElement.embeddedDataSpecifications?.[0]?.dataSpecificationContent?.unit || selectedElement.unit
    const categoryValue = selectedElement.category

    // Determine cardinality from qualifiers if available, otherwise default
    let cardinalityValue = "N/A";
    const cardinalityQualifier = selectedElement.qualifiers?.find((q: any) => q.type === "Cardinality");
    if (cardinalityQualifier && cardinalityQualifier.value) {
      cardinalityValue = cardinalityQualifier.value;
    } else if (selectedElement.cardinality) { // Fallback to direct cardinality property
      cardinalityValue = selectedElement.cardinality;
    }

    return (
      <div>
        {/* Header matching editor style */}
        <div className="aasx-details-header" style={{ backgroundColor: hexToRgba(typeColor, 0.2) }}>
          {getTypeBadge(type, true)}
          <div className="aasx-details-header-title" style={{ color: typeColor }}>
            Submodel Element ({type})
          </div>
        </div>

        {/* VALUE section - always show */}
        <div className="p-4 space-y-3 bg-green-50 dark:bg-green-900/20 border-b">
          <h4 className="text-sm font-semibold text-green-800 dark:text-green-300 uppercase">
            Value
          </h4>
          {type === "MultiLanguageProperty" ? (
            <div className="space-y-2">
              {getDetailValue().length > 0 ? (
                getDetailValue().map((item: any, idx: number) => (
                  <div key={idx} className="text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Language: {item.language || 'en'} ({item.language === 'en' ? 'en' : item.language})
                    </span>
                    <div className="mt-1 p-2 bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 font-mono break-all">
                      {item.text || ''}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500 italic">Not specified</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
              {typeof getDetailValue() === 'string' ? getDetailValue() : ''}
            </div>
          )}
        </div>

        {/* PROPERTY METADATA section - always show all fields */}
        <div className="p-4 space-y-3 bg-blue-50 dark:bg-blue-900/20 border-b">
          <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase">
            Property Metadata
          </h4>
          
          <div className="space-y-3 text-sm">
            {/* Type - always show */}
            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Type:
              </span>
              <span className="font-mono text-gray-900 dark:text-gray-100">
                {type}
              </span>
            </div>

            {/* Preferred Name - always show */}
            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Preferred Name (English):
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {preferredNameValue || <span className="text-gray-400 italic">Not specified</span>}
              </span>
            </div>

            {/* Short Name - always show */}
            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Short Name (English):
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {shortNameValue || <span className="text-gray-400 italic">Not specified</span>}
              </span>
            </div>

            {/* Data Type - always show */}
            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Data Type:
              </span>
              <span className="font-mono text-gray-900 dark:text-gray-100">
                {dataTypeValue || <span className="text-gray-400 italic">Not specified</span>}
              </span>
            </div>

            {/* Value Type - always show for Property */}
            {(type === "Property" || selectedElement.valueType) && (
              <div>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  Value Type:
                </span>
                <span className="font-mono text-gray-900 dark:text-gray-100">
                  {selectedElement.valueType || <span className="text-gray-400 italic">Not specified</span>}
                </span>
              </div>
            )}

            {/* Unit - always show */}
            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Unit:
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {unitValue || <span className="text-gray-400 italic">Not specified</span>}
              </span>
            </div>

            {/* Category - always show */}
            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Category:
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {categoryValue || <span className="text-gray-400 italic">Not specified</span>}
              </span>
            </div>

            {/* Cardinality - always show */}
            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Cardinality:
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-gray-900 dark:text-gray-100">
                  {cardinalityValue}
                </span>
                {cardinalityValue !== "N/A" && (
                  <span className="text-xs text-gray-500">
                    {cardinalityValue === 'One' && '(Required)'}
                    {cardinalityValue === 'ZeroToOne' && '(Optional)'}
                    {cardinalityValue === 'ZeroToMany' && '(Multiple Optional)'}
                    {cardinalityValue === 'OneToMany' && '(Multiple Required)'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SEMANTIC ID section - always show */}
        <div className="p-4 space-y-2 bg-purple-50 dark:bg-purple-900/20 border-b">
          <h4 className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase">
            Semantic ID (ECLASS/IEC61360)
          </h4>
          <div className="text-xs font-mono text-gray-900 dark:text-gray-100 break-all">
            {semanticIdValue === "N/A" ? <span className="text-gray-400 italic">Not specified</span> : semanticIdValue}
          </div>
          {semanticIdValue !== "N/A" && semanticIdValue.startsWith('http') && (
            <a
              href={semanticIdValue}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline inline-block mt-1"
            >
              View specification →
            </a>
          )}
        </div>

        {/* DEFINITION/DESCRIPTION section - always show */}
        <div className="p-4 space-y-2 bg-gray-100 dark:bg-gray-700 border-b">
          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
            Definition/Description
          </h4>
          <div className="text-sm text-gray-900 dark:text-gray-100">
            {descriptionText === "N/A" ? <span className="text-gray-400 italic">Not specified</span> : descriptionText}
          </div>
        </div>
      </div>
    )
  }

  // Get the first AAS from the selected file's AAS data
  const currentAAS = selectedFile?.aasData?.assetAdministrationShells?.[0];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* File selector row at top */}
      <div className="w-full px-5 py-3 overflow-x-auto" style={{ backgroundColor: "rgba(97, 202, 243, 0.1)" }}>
        <div className="flex gap-3 items-center">
          <div className="text-sm font-medium text-gray-700 shrink-0">Uploaded Files:</div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {uploadedFiles.map((file, idx) => (
              <div
                key={idx}
                className={`h-[90px] w-[140px] min-w-[140px] rounded-lg flex flex-col items-center justify-between p-3 cursor-pointer transition-all relative ${
                  selectedFile === file ? "border-2" : "border border-[#adadae]"
                }`}
                style={{
                  borderColor: selectedFile === file ? "#61caf3" : undefined,
                }}
                onClick={() => {
                  setSelectedFile(file)
                  setSelectedElement(null)
                  setExpandedNodes(new Set())
                }}
              >
                {file.valid !== undefined && (
                  <div className="absolute top-1 right-1">
                    {file.valid ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-[8px] font-semibold text-green-600 uppercase tracking-tight">IDTA</span>
                      </div>
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                  </div>
                )}

                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: selectedFile === file ? "#61caf3" : "#adadae" }}
                >
                  <FileText className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs text-center truncate w-full ${
                    selectedFile === file ? "text-[#61caf3] font-medium" : "text-[#adadae]"
                  }`}
                  title={file.file || file.file}
                >
                  {file.file || file.file}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="aasx-overlay-container">
        {/* Left Panel - Submodels */}
        <div className="aasx-left-panel" style={{ backgroundColor: "rgba(97, 202, 243, 0.1)" }}>
          {/* AAS Information Section */}
          {currentAAS && (
            <div className="mb-4 px-2 py-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-blue-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
                Asset Administration Shell
              </h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">IdShort:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{currentAAS.idShort || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">ID:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100 break-all text-right">{currentAAS.id || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Asset Kind:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{currentAAS.assetKind || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Global Asset ID:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100 break-all text-right">{currentAAS.assetInformation?.globalAssetId || 'N/A'}</span>
                </div>
              </div>
            </div>
          )}

          {selectedFile?.thumbnail ? (
            <div className="mb-4 px-2">
              <div className="w-full h-[150px] rounded-lg border-2 border-[#61caf3] shadow-md overflow-hidden flex items-center justify-center bg-white">
                <img
                  src={selectedFile.thumbnail || "/placeholder.svg"}
                  alt="AASX Thumbnail"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="mb-4 px-2">
              <div className="w-full h-[150px] rounded-lg border-2 border-dashed border-[#adadae] flex items-center justify-center text-gray-400 text-sm bg-white">
                No thumbnail
              </div>
            </div>
          )}

          {aasxData?.submodels?.length > 0 ? (
            aasxData.submodels.map((submodel: any, idx: number) => (
              <div
                key={submodel.id || idx}
                className={`aasx-submodel-card ${selectedSubmodel === submodel ? "" : "aasx-submodel-card-default"}`}
                style={{
                  border: selectedSubmodel === submodel ? "1px solid #61caf3" : undefined,
                }}
                onClick={() => {
                  setSelectedSubmodel(submodel)
                  setSelectedElement(null)
                  setExpandedNodes(new Set())
                }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: selectedSubmodel === submodel ? "#61caf3" : "#adadae" }}
                >
                  <FileText className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs text-center truncate w-full ${
                    selectedSubmodel === submodel ? "text-[#61caf3] font-medium" : "text-[#adadae]"
                  }`}
                  title={submodel.idShort || `Submodel ${idx + 1}`}
                >
                  {submodel.idShort || `Submodel ${idx + 1}`}
                </span>
              </div>
            ))
          ) : (
            <div className="aasx-no-selection-message">No submodels found</div>
          )}
        </div>

        {/* Middle Panel - Tree View and Validation Errors */}
        <div className="aasx-middle-panel">
          <div className="aasx-middle-panel-scroll">
            <div className="aasx-middle-panel-content">
              {selectedSubmodel ? (
                <>
                  <div className="aasx-submodel-header">
                    <div className="aasx-submodel-header-left">
                      <span className="aasx-submodel-badge">SM</span>
                      <span>{selectedSubmodel.idShort}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hideEmptyElements}
                          onChange={(e) => setHideEmptyElements(e.target.checked)}
                          className="w-4 h-4 text-[#61caf3] border-gray-300 rounded focus:ring-[#61caf3]"
                        />
                        <span>Hide empty</span>
                      </label>
                      <span className="aasx-submodel-element-count">
                        {selectedSubmodel.submodelElements?.length || 0} elements
                      </span>
                    </div>
                  </div>
                  {selectedSubmodel.submodelElements?.map((element: any, idx: number) =>
                    renderTreeNode(element, 0, `submodel-${idx}`),
                  )}
                </>
              ) : (
                <div className="aasx-no-selection-message">Select a submodel to view its elements</div>
              )}

              {/* Validation Errors section (moved here) */}
              {selectedFile && !selectedFile.valid && selectedFile.errors && selectedFile.errors.length > 0 && (
                <div className="p-4 mt-4"> {/* Added margin-top for spacing */}
                  <Collapsible className="border border-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-4 text-red-800 dark:text-red-300 font-semibold">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <span>Validation Errors ({selectedFile.errors.length})</span>
                      </div>
                      <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-t border-red-200 dark:border-red-700 p-4">
                      <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-200 space-y-2">
                        {selectedFile.errors.map((error, index) => (
                          <li key={index} className="break-words">
                            {typeof error === 'string' ? error : error.message}
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Details */}
        <div className="aasx-right-panel">{renderDetails()}</div>
      </div>
    </div>
  )
}