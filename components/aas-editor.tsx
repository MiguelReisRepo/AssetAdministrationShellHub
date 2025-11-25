"use client"

import { useState, useEffect } from "react"
import { ChevronRight, ChevronDown, Download, ArrowLeft, FileText, Plus, Trash2, X, Upload, GripVertical, Copy, Eye } from 'lucide-react'
// ADD: extra icons and UI + toast
import { AlertCircle, CheckCircle } from 'lucide-react'
import { FileDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import JSZip from 'jszip'
import { validateAASXXml } from "@/lib/xml-validator" // Import the XML validation function
import type { ValidationResult } from "@/lib/types" // Import ValidationResult type
import { processFile } from "@/lib/process-file"
import AasEditorDebugXML from "./aas-editor-debug"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { validateAASXJson } from "@/lib/json-validator"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

// Add IEC 61360 data types list
const IEC_DATA_TYPES = [
  'DATE',
  'STRING',
  'STRING_TRANSLATABLE',
  'INTEGER_MEASURE',
  'INTEGER_COUNT',
  'INTEGER_CURRENCY',
  'REAL_MEASURE',
  'REAL_COUNT',
  'REAL_CURRENCY',
  'BOOLEAN',
  'IRI',
  'IRDI',
  'RATIONAL',
  'RATIONAL_MEASURE',
  'TIME',
  'TIMESTAMP',
  'FILE',
  'HTML',
  'BLOB',
];

const XSD_VALUE_TYPES = [
  'xs:string','xs:boolean','xs:decimal','xs:integer','xs:long','xs:int','xs:short','xs:byte',
  'xs:double','xs:float','xs:dateTime','xs:date','xs:time','xs:anyURI','xs:duration',
  'xs:gYearMonth','xs:gYear','xs:gMonthDay','xs:gDay','xs:gMonth',
  'xs:unsignedLong','xs:unsignedInt','xs:unsignedShort','xs:unsignedByte',
  'xs:base64Binary','xs:hexBinary'
];
const XSD_CANON_MAP: Record<string, string> =
  Object.fromEntries(XSD_VALUE_TYPES.map(t => [t.slice(3).toLowerCase(), t]));

function normalizeValueType(t?: string): string | undefined {
  if (!t) return undefined;
  const s = t.trim();
  if (!s) return undefined;
  // Accept "xs:*" with any case, and plain names like "string"
  const hasPrefix = s.slice(0,3).toLowerCase() === 'xs:';
  const local = hasPrefix ? s.slice(3) : s;
  const canonical = XSD_CANON_MAP[local.toLowerCase()];
  return canonical || undefined;
}

// Escape special XML characters to avoid parser errors (&, <, >, quotes)
function escapeXml(s?: string): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// SHARED HELPERS: make these available to both generateFinalAAS and validateAAS
function deriveValueTypeFromIEC(iec?: string): string | undefined {
  switch ((iec || '').toUpperCase()) {
    case 'DATE': return 'xs:date';
    case 'STRING': return 'xs:string';
    case 'STRING_TRANSLATABLE': return 'xs:string';
    case 'INTEGER_MEASURE':
    case 'INTEGER_COUNT':
    case 'INTEGER_CURRENCY': return 'xs:integer';
    case 'REAL_MEASURE':
    case 'REAL_COUNT':
    case 'REAL_CURRENCY': return 'xs:decimal';
    case 'BOOLEAN': return 'xs:boolean';
    case 'IRI': return 'xs:anyURI';
    case 'IRDI': return 'xs:string';
    case 'RATIONAL':
    case 'RATIONAL_MEASURE': return 'xs:string';
    case 'TIME': return 'xs:time';
    case 'TIMESTAMP': return 'xs:dateTime';
    case 'FILE': return 'xs:string';
    case 'HTML': return 'xs:string';
    case 'BLOB': return 'xs:base64Binary';
    default: return undefined;
  }
}

function isValidValueForXsdType(vt: string, val: string): boolean {
  const v = (val ?? '').trim();
  if (!v) return true; // empties handled by required checks
  switch (vt) {
    case 'xs:boolean': {
      const lower = v.toLowerCase();
      // XML Schema boolean allows true/false and 1/0
      return lower === 'true' || lower === 'false' || v === '1' || v === '0';
    }
    case 'xs:integer':
    case 'xs:int':
    case 'xs:long':
    case 'xs:short':
    case 'xs:byte':
      return /^-?\d+$/.test(v);
    case 'xs:unsignedLong':
    case 'xs:unsignedInt':
    case 'xs:unsignedShort':
    case 'xs:unsignedByte':
      return /^\d+$/.test(v);
    case 'xs:float':
    case 'xs:double':
    case 'xs:decimal':
      return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v);
    default:
      return true;
  }
}

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
  modelType: "Property" | "MultiLanguageProperty" | "SubmodelElementCollection" | "SubmodelElementList" | "File" | "ReferenceElement"
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
  onFileGenerated?: (file: ValidationResult) => void
  onUpdateAASConfig: (newConfig: AASConfig) => void
  initialSubmodelData?: Record<string, SubmodelElement[]>
  onSave?: (file: ValidationResult) => void
  initialThumbnail?: string | null
  // NEW: pass original uploaded XML to align Validate and Preview with home/upload
  sourceXml?: string
  // NEW: attachments from the uploaded AASX (path -> data URL)
  attachments?: Record<string, string>
}

export function AASEditor({ aasConfig, onBack, onFileGenerated, onUpdateAASConfig, initialSubmodelData, onSave, initialThumbnail, sourceXml, attachments }: AASEditorProps) {
  const [submodelData, setSubmodelData] = useState<Record<string, SubmodelElement[]>>(() => {
    const initial: Record<string, SubmodelElement[]> = {}
    aasConfig.selectedSubmodels.forEach((sm) => {
      initial[sm.idShort] =
        (initialSubmodelData && initialSubmodelData[sm.idShort])
          ? initialSubmodelData[sm.idShort]
          : generateTemplateStructure(sm.template.name)
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
  const [thumbnail, setThumbnail] = useState<string | null>(initialThumbnail || null)
// ADD: initialize editMode to control AAS info and right panel editing
  const [editMode, setEditMode] = useState(false)
  const [templateSearchQuery, setSearchQuery] = useState("")
  const [draggedItem, setDraggedItem] = useState<{ path: string[]; element: SubmodelElement } | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)

  const [isGenerating, setIsGenerating] = useState(false)
  // ADD: validation issue states
  const [internalIssues, setInternalIssues] = useState<string[]>([])
  const [externalIssues, setExternalIssues] = useState<string[]>([])
  const [lastGeneratedXml, setLastGeneratedXml] = useState<string | null>(null)
  // ADD: original uploaded XML if provided
  const [originalXml, setOriginalXml] = useState<string | null>(sourceXml ?? null)
  // New: gate generation until a successful validation
  const [canGenerate, setCanGenerate] = useState(false)
  // New: track whether validation has been run (and is current)
  const [hasValidated, setHasValidated] = useState(false)
  const [downloadingPdfs, setDownloadingPdfs] = useState(false) // used as "preparing" spinner
  const [noPdfsDialogOpen, setNoPdfsDialogOpen] = useState(false)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [pdfEntries, setPdfEntries] = useState<{ name: string; bytes: Uint8Array; url: string }[]>([])
  const [pdfSelected, setPdfSelected] = useState<Set<string>>(new Set())
  // ADD: keep raw XML errors (objects with message + loc.lineNumber) to derive paths and hints
  const [xmlErrorsRaw, setXmlErrorsRaw] = useState<any[]>([])
  // Validation result dialog state
  const [validationDialogOpen, setValidationDialogOpen] = useState(false)
  const [validationDialogStatus, setValidationDialogStatus] = useState<'valid' | 'invalid'>('invalid')
  const [validationCounts, setValidationCounts] = useState<{ internal: number; json: number; xml: number }>({
    internal: 0,
    json: 0,
    xml: 0,
  })

  // Any change to AAS content should require re-validation
  useEffect(() => {
    setCanGenerate(false)
    setHasValidated(false)
  }, [submodelData, aasConfig.idShort, aasConfig.id, aasConfig.assetKind, aasConfig.globalAssetId, aasConfig.selectedSubmodels])

  // Helper: convert base64 dataURL to Uint8Array
  const dataUrlToUint8 = (dataUrl: string): Uint8Array => {
    const base64 = dataUrl.split(",")[1] || ""
    const binary = atob(base64)
    const buf = new ArrayBuffer(binary.length)
    const arr = new Uint8Array(buf)
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
    return arr
  }

  // Helper: try decode URL-safe base64 strings (used by some file values)
  const tryDecodeBase64 = (s: string): string | null => {
    try {
      const normalized = s.replace(/-/g, "+").replace(/_/g, "/")
      const pad = normalized.length % 4
      const padded = pad ? normalized + "=".repeat(4 - pad) : normalized
      return atob(padded)
    } catch {
      return null
    }
  }
  const normalizePath = (p: string) =>
    p.replace(/^file:\/\//i, "").replace(/^file:\//i, "").replace(/^\/+/, "")
  // EXTRA: helpers to strip query/fragment, fix slashes and decode URI components
  const stripQueryAndFragment = (p: string) => p.replace(/[?#].*$/, "")
  const fixSlashes = (p: string) => p.replace(/\\/g, "/")
  const tryDecodeUri = (s: string): string => {
    try { return decodeURIComponent(s) } catch { return s }
  }
  const deriveBasename = (p: string): string => {
    const cleaned = stripQueryAndFragment(fixSlashes(p))
    let base = cleaned.split("/").pop() || cleaned
    // Handle AASX "File-" naming pattern (e.g., ".../File-Manual.pdf")
    const idx = cleaned.lastIndexOf("File-")
    if (idx >= 0) {
      const tail = cleaned.slice(idx + "File-".length)
      if (/\.[a-z0-9]{2,5}$/i.test(tail)) base = tail
    }
    return base
  }

  // Collect all PDF files from the current model
  const collectAllPdfs = (): { name: string; bytes: Uint8Array }[] => {
    const pdfs: { name: string; bytes: Uint8Array }[] = []

    const fromAttachments = (raw: string): { name: string; bytes: Uint8Array } | null => {
      if (!attachments) return null
      let candidate = raw.trim()
      if (!candidate) return null
      // decode URL-safe base64 that may encode a path
      const decoded = tryDecodeBase64(candidate)
      if (decoded) candidate = decoded.trim()
      // direct data URL
      if (/^data:/i.test(candidate)) {
        if (/^data:application\/pdf/i.test(candidate)) {
          return { name: "document.pdf", bytes: dataUrlToUint8(candidate) }
        }
        return null
      }
      // normalize incoming path
      candidate = tryDecodeUri(candidate)
      const norm = normalizePath(stripQueryAndFragment(fixSlashes(candidate)))
      const basename = deriveBasename(norm)
      const searchKeys = [
        norm,
        `/${norm}`,
        basename,
        `/${basename}`,
        `aasx/${basename}`,
        `/aasx/${basename}`,
      ]
      let foundKey: string | undefined
      for (const key of searchKeys) {
        if (attachments[key]) { foundKey = key; break }
      }
      if (!foundKey) {
        const kv = Object.entries(attachments).find(([k]) => {
          const lk = k.toLowerCase()
          const bb = basename.toLowerCase()
          return lk.endsWith(`/${bb}`) || lk === bb
        })
        if (kv) foundKey = kv[0]
      }
      if (!foundKey) return null
      const dataUrl = attachments[foundKey]
      const isPdfMime = /^data:application\/pdf/i.test(dataUrl)
      const looksPdf = /\.pdf$/i.test(foundKey) || /\.pdf$/i.test(basename)
      if (!isPdfMime && !looksPdf) return null
      const name = basename || (foundKey.split("/").pop() || "document.pdf")
      return { name, bytes: dataUrlToUint8(dataUrl) }
    }

    const walk = (els: SubmodelElement[]) => {
      els.forEach((el) => {
        if (el.modelType === "File") {
          const rawVal = typeof el.value === "string" ? el.value : ""
          const mime = (el.fileData?.mimeType || "").toLowerCase()
          const lowerVal = rawVal.toLowerCase()

          // Priority 1: fileData content available from editor uploads
          if (el.fileData?.content && (mime === "application/pdf" || /\.pdf$/.test(lowerVal))) {
            const name = el.fileData.fileName?.trim() || `${el.idShort || "document"}.pdf`
            pdfs.push({ name, bytes: dataUrlToUint8(el.fileData.content) })
          } else if (rawVal && /^data:application\/pdf/i.test(rawVal)) {
            // Priority 2: direct data URL in value
            const name = `${el.idShort || "document"}.pdf`
            pdfs.push({ name, bytes: dataUrlToUint8(rawVal) })
          } else if (rawVal) {
            // Priority 3: resolve via attachments from original AASX
            const resolved = fromAttachments(rawVal)
            if (resolved) pdfs.push(resolved)
          }
        }
        if (el.children && el.children.length) walk(el.children)
      })
    }

    aasConfig.selectedSubmodels.forEach((sm) => {
      const elements = submodelData[sm.idShort] || []
      walk(elements)
    })
    // FALLBACK: if no File nodes referenced PDFs but archive contains PDFs, include them
    if (pdfs.length === 0 && attachments) {
      Object.entries(attachments).forEach(([path, dataUrl]) => {
        const isPdf = /^data:application\/pdf/i.test(dataUrl) || /\.pdf$/i.test(path)
        if (isPdf) {
          const name = deriveBasename(path) || "document.pdf"
          pdfs.push({ name, bytes: dataUrlToUint8(dataUrl) })
        }
      })
    }
    return pdfs
  }

  // Prepare and open the PDF selection dialog
  const openPdfDialog = async () => {
    setDownloadingPdfs(true)
    const pdfs = collectAllPdfs()
    if (pdfs.length === 0) {
      setNoPdfsDialogOpen(true)
      setDownloadingPdfs(false)
      return
    }
    // Build blob URLs for preview
    const entries = pdfs.map((p) => {
      const blob = new Blob([p.bytes], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      return { name: p.name, bytes: p.bytes, url }
    })
    setPdfEntries(entries)
    setPdfSelected(new Set(entries.map(e => e.name))) // default: select all
    setPdfDialogOpen(true)
    setDownloadingPdfs(false)
  }

  // Revoke blob URLs when dialog closes
  const closePdfDialog = () => {
    pdfEntries.forEach((e) => URL.revokeObjectURL(e.url))
    setPdfEntries([])
    setPdfSelected(new Set())
    setPdfDialogOpen(false)
  }

  // Toggle selection for a single PDF
  const togglePdfSelection = (name: string, checked: boolean) => {
    setPdfSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(name)
      else next.delete(name)
      return next
    })
  }

  // Toggle select all
  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setPdfSelected(new Set(pdfEntries.map(e => e.name)))
    } else {
      setPdfSelected(new Set())
    }
  }

  // Download only selected PDFs
  const downloadSelectedPdfs = async () => {
    const selectedNames = Array.from(pdfSelected)
    if (selectedNames.length === 0) {
      toast.error("Select at least one PDF to download.")
      return
    }
    const zip = new JSZip()
    pdfEntries.forEach((e) => {
      if (pdfSelected.has(e.name)) {
        zip.file(`pdfs/${e.name}`, e.bytes)
      }
    })
    const blob = await zip.generateAsync({ type: "blob" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${aasConfig.idShort || "model"}-pdfs-selected.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${selectedNames.length} PDF${selectedNames.length > 1 ? "s" : ""}.`)
    closePdfDialog()
  }

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
    const key = (type || "").toString().toLowerCase();

    const badgeMap: Record<string, { label: string; color: string }> = {
      // core
      property: { label: "Prop", color: "#6662b4" },
      multilanguageproperty: { label: "MLP", color: "#ffa500" },
      submodelelementcollection: { label: "SMC", color: "#61caf3" },
      submodelelementlist: { label: "SML", color: "#61caf3" },
      file: { label: "File", color: "#10b981" },
      referenceelement: { label: "REF", color: "#1793b8" },
      range: { label: "RNG", color: "#8b5cf6" },
      operation: { label: "OP", color: "#ef4444" },

      // events
      basiceventelement: { label: "EVT", color: "#0ea5e9" },
      event: { label: "EVT", color: "#0ea5e9" },
      eventelement: { label: "EVT", color: "#0ea5e9" },

      // other common types
      blob: { label: "BLOB", color: "#14b8a6" },
      entity: { label: "ENT", color: "#f59e0b" },
      relationshipelement: { label: "REL", color: "#7c3aed" },
      annotatedrelationshipelement: { label: "AREL", color: "#7c3aed" },
      capability: { label: "CAP", color: "#22c55e" },
    };

    const badge = badgeMap[key] || { label: "Node", color: "#1793b8" };
    return (
      <span
        className="px-2 py-0.5 text-white text-xs font-semibold rounded"
        style={{ backgroundColor: badge.color }}
      >
        {badge.label}
      </span>
    );
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
    // Use a unique React key per sibling; keep nodeId for expand/validation logic
    const reactKey = `${nodeId}#${index}`
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

          {(selectedElement.modelType === "Property") && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Value Type:
              </label>
              <select
                value={normalizeValueType(selectedElement.valueType) || ''}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  updateElementMetadata(selectedSubmodel.idShort, elementPath, 'valueType', val);
                }}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm font-mono"
              >
                <option value="">Select xs:* type...</option>
                {XSD_VALUE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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
                <select
                  value={selectedElement.dataType || ''}
                  onChange={(e) =>
                    updateElementMetadata(
                      selectedSubmodel.idShort,
                      elementPath,
                      'dataType',
                      e.target.value || undefined
                    )
                  }
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-sm"
                >
                  <option value="">Select data type...</option>
                  {IEC_DATA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
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

  // Helper to build current XML (same structure as in export) for validation
  const buildCurrentXml = (): string => {
    const collectedConceptDescriptions: Record<string, ConceptDescription> = {};

    const escape = (s?: string) => {
      if (s == null) return "";
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    };

    const normalizeVT = (t?: string, iec?: string) =>
      normalizeValueType(t) || deriveValueTypeFromIEC(iec) || "xs:string";

    const generateElementXml = (element: SubmodelElement, indent: string): string => {
      const normalizedType = (() => {
        const t = (element.modelType || "Property").toLowerCase();
        switch (t) {
          case "property": return "Property";
          case "multilanguageproperty": return "MultiLanguageProperty";
          case "submodelelementcollection": return "SubmodelElementCollection";
          case "submodelelementlist": return "SubmodelElementList";
          case "file": return "File";
          case "referenceelement": return "ReferenceElement";
          default: return "Property";
        }
      })();

      const tagName =
        normalizedType === "Property" ? "property" :
        normalizedType === "MultiLanguageProperty" ? "multiLanguageProperty" :
        normalizedType === "SubmodelElementCollection" ? "submodelElementCollection" :
        normalizedType === "SubmodelElementList" ? "submodelElementList" :
        normalizedType === "File" ? "file" :
        normalizedType === "ReferenceElement" ? "referenceElement" :
        "property";

      let xml = `${indent}<${tagName}>\n`;

      // Common fields
      if (element.category) {
        xml += `${indent}  <category>${escapeXml(element.category)}</category>\n`;
      }
      xml += `${indent}  <idShort>${escapeXml(element.idShort)}</idShort>\n`;

      if (element.description && String(element.description).trim() !== "") {
        const desc = typeof element.description === "string" ? element.description : String(element.description);
        xml += `${indent}  <description>\n`;
        xml += `${indent}    <langStringTextType>\n`;
        xml += `${indent}      <language>en</language>\n`;
        xml += `${indent}      <text>${escapeXml(desc)}</text>\n`;
        xml += `${indent}    </langStringTextType>\n`;
        xml += `${indent}  </description>\n`;
      }

      // Type-specific content FIRST
      if (normalizedType === "Property") {
        const vtNorm = normalizeValueType(element.valueType) || deriveValueTypeFromIEC(element.dataType) || "xs:string";
        xml += `${indent}  <valueType>${escapeXml(vtNorm)}</valueType>\n`;
        const valStr = typeof element.value === "string" ? element.value.trim() : "";
        if (valStr) {
          xml += `${indent}  <value>${escapeXml(valStr)}</value>\n`;
        } else {
          // INSERT: empty value to satisfy 3.1 sequence when neither value nor valueId exists
          xml += `${indent}  <value/>\n`;
        }
      } else if (normalizedType === "MultiLanguageProperty") {
        const hasLangValues = typeof element.value === "object" && element.value !== null && Object.values(element.value).some(text => text && String(text).trim() !== "");
        if (hasLangValues) {
          xml += `${indent}  <value>\n`;
          Object.entries(element.value as Record<string, string>).forEach(([lang, text]) => {
            if (text && String(text).trim() !== "") {
              xml += `${indent}    <langStringTextType>\n`;
              xml += `${indent}      <language>${lang}</language>\n`;
              xml += `${indent}      <text>${escapeXml(text)}</text>\n`;
              xml += `${indent}    </langStringTextType>\n`;
            }
          });
          xml += `${indent}  </value>\n`;
        } else {
          // INSERT: empty value element to satisfy schema order
          xml += `${indent}  <value/>\n`;
        }
      } else if (normalizedType === "File") {
        const contentType = element.fileData?.mimeType || "application/octet-stream";
        xml += `${indent}  <contentType>${escapeXml(contentType)}</contentType>\n`;
        const valStr = typeof element.value === "string" ? element.value.trim() : "";
        if (valStr) {
          xml += `${indent}  <value>${escapeXml(valStr)}</value>\n`;
        } else {
          // INSERT: empty value element to satisfy schema order
          xml += `${indent}  <value/>\n`;
        }
      } else if (normalizedType === "SubmodelElementCollection" || normalizedType === "SubmodelElementList") {
        if (element.children && element.children.length > 0) {
          xml += `${indent}  <value>\n`;
          element.children.forEach(child => {
            xml += generateElementXml(child, indent + "    ");
          });
          xml += `${indent}  </value>\n`;
        }
      } else if (normalizedType === "ReferenceElement") {
        const val = element.value as any;
        const hasKeys = val && typeof val === "object" && Array.isArray(val.keys);
        if (hasKeys) {
          xml += `${indent}  <value>\n`;
          xml += `${indent}    <type>${escapeXml(val.type || "ExternalReference")}</type>\n`;
          xml += `${indent}    <keys>\n`;
          (val.keys as any[]).forEach((k) => {
            xml += `${indent}      <key>\n`;
            xml += `${indent}        <type>${escapeXml(k.type || "GlobalReference")}</type>\n`;
            xml += `${indent}        <value>${escapeXml(k.value || "")}</value>\n`;
            xml += `${indent}      </key>\n`;
          });
          xml += `${indent}    </keys>\n`;
          xml += `${indent}  </value>\n`;
        } else {
          const simple = typeof val === "string" ? val.trim() : "";
          const fallback = simple || (element.semanticId || "").trim();
          if (fallback) {
            xml += `${indent}  <valueId>${escapeXml(fallback)}</valueId>\n`;
          }
        }
      }

      // semanticId NEVER on ReferenceElement
      if (element.semanticId && normalizedType !== "ReferenceElement") {
        xml += `${indent}  <semanticId>\n`;
        xml += `${indent}    <type>ExternalReference</type>\n`;
        xml += `${indent}    <keys>\n`;
        xml += `${indent}      <key>\n`;
        xml += `${indent}        <type>GlobalReference</type>\n`;
        xml += `${indent}        <value>${escapeXml(element.semanticId)}</value>\n`;
        xml += `${indent}      </key>\n`;
        xml += `${indent}    </keys>\n`;
        xml += `${indent}  </semanticId>\n`;
      }

      // Embedded Data Specifications (IEC 61360)
      const hasIECMeta =
        (typeof element.preferredName === "string" && element.preferredName.trim() !== "") ||
        (typeof element.preferredName === "object" && element.preferredName && Object.values(element.preferredName).some(v => v && String(v).trim() !== "")) ||
        (typeof element.shortName === "string" && element.shortName.trim() !== "") ||
        (typeof element.shortName === "object" && element.shortName && Object.values(element.shortName).some(v => v && String(v).trim() !== "")) ||
        (element.unit && element.unit.trim() !== "") ||
        (element.dataType && element.dataType.trim() !== "") ||
        (element.description && String(element.description).trim() !== "");

      if (hasIECMeta) {
        const prefNames = typeof element.preferredName === "string" ? { en: element.preferredName } : (element.preferredName || {});
        const shortNames = typeof element.shortName === "string" ? { en: element.shortName } : (element.shortName || {});
        const preferredNameXml = Object.entries(prefNames as Record<string, string>)
          .filter(([_, text]) => text && String(text).trim() !== "")
          .map(([lang, text]) =>
            `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>${lang}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringPreferredNameTypeIec61360>
`).join("");
        const hasShortNames = shortNames && Object.values(shortNames as Record<string, string>).some(v => v && String(v).trim() !== "");
        const shortNameXml = hasShortNames
          ? Object.entries(shortNames as Record<string, string>)
              .filter(([_, text]) => text && String(text).trim() !== "")
              .map(([lang, text]) =>
                `${indent}            <langStringShortNameTypeIec61360>
${indent}              <language>${lang}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringShortNameTypeIec61360>
`).join("")
          : "";

        xml += `${indent}  <embeddedDataSpecifications>\n`;
        xml += `${indent}    <embeddedDataSpecification>\n`;
        xml += `${indent}      <dataSpecification>\n`;
        xml += `${indent}        <type>ExternalReference</type>\n`;
        xml += `${indent}        <keys>\n`;
        xml += `${indent}          <key>\n`;
        xml += `${indent}            <type>GlobalReference</type>\n`;
        xml += `${indent}            <value>https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360</value>\n`;
        xml += `${indent}          </key>\n`;
        xml += `${indent}        </keys>\n`;
        xml += `${indent}      </dataSpecification>\n`;
        xml += `${indent}      <dataSpecificationContent>\n`;
        xml += `${indent}        <dataSpecificationIec61360>\n`;
        xml += `${indent}          <preferredName>\n`;
        xml += `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>en</language>
${indent}              <text>${escapeXml(element.idShort)}</text>
${indent}            </langStringPreferredNameTypeIec61360>
`;
        xml += `${indent}          </preferredName>\n`;
        if (hasShortNames) {
          xml += `${indent}          <shortName>\n`;
          xml += shortNameXml;
          xml += `${indent}          </shortName>\n`;
        }
        if (element.unit && element.unit.trim() !== "") {
          xml += `${indent}          <unit>${escapeXml(element.unit)}</unit>\n`;
        }
        if (element.dataType && element.dataType.trim() !== "") {
          xml += `${indent}          <dataType>${escapeXml(element.dataType)}</dataType>\n`;
        }
        if (element.description && String(element.description).trim() !== "") {
          const desc2 = typeof element.description === "string" ? element.description : String(element.description);
          xml += `${indent}          <definition>\n`;
          xml += `${indent}            <langStringDefinitionTypeIec61360>\n`;
          xml += `${indent}              <language>en</language>\n`;
          xml += `${indent}              <text>${escapeXml(desc2)}</text>\n`;
          xml += `${indent}            </langStringDefinitionTypeIec61360>\n`;
          xml += `${indent}          </definition>\n`;
        }
        xml += `${indent}        </dataSpecificationIec61360>\n`;
        xml += `${indent}      </dataSpecificationContent>\n`;
        xml += `${indent}    </embeddedDataSpecification>\n`;
        xml += `${indent}  </embeddedDataSpecifications>\n`;
      }

      xml += `${indent}</${tagName}>\n`;
      return xml;
    };

    const collectConcepts = (elements: SubmodelElement[]) => {
      elements.forEach(element => {
        if (element.semanticId) {
          const id = element.semanticId;
          if (!collectedConceptDescriptions[id]) {
            collectedConceptDescriptions[id] = {
              id,
              idShort: element.idShort,
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
        if (element.children) collectConcepts(element.children);
      });
    };

    aasConfig.selectedSubmodels.forEach(sm => {
      const elements = submodelData[sm.idShort] || [];
      collectConcepts(elements);
    });

    let defaultThumbnailXml = '';
    if (thumbnail) {
      const mimeTypeMatch = thumbnail.match(/^data:(image\/(png|jpeg|gif|svg\+xml));base64,/)
      if (mimeTypeMatch) {
        const mime = mimeTypeMatch[1];
        const ext = mimeTypeMatch[2] === 'svg+xml' ? 'svg' : mimeTypeMatch[2];
        defaultThumbnailXml = `        <defaultThumbnail>
          <path>thumbnail.${ext}</path>
          <contentType>${mime}</contentType>
        </defaultThumbnail>
`;
      }
    }

    const submodelsXml = aasConfig.selectedSubmodels.map(sm => {
      const elements = submodelData[sm.idShort] || [];
      return `    <submodel>
      <idShort>${escapeXml(sm.idShort)}</idShort>
      <id>${escapeXml(`${aasConfig.id}/submodels/${sm.idShort}`)}</id>
      <kind>Instance</kind>
      <semanticId>
        <type>ExternalReference</type>
        <keys>
          <key>
            <type>GlobalReference</type>
            <value>${escapeXml(sm.template.url || ('https://admin-shell.io/submodels/' + sm.idShort))}</value>
          </key>
        </keys>
      </semanticId>
      <submodelElements>
${elements.map(el => generateElementXml(el, "        ")).join('')}      </submodelElements>
    </submodel>`;
    }).join('\n');

    const conceptXml = Object.values(collectedConceptDescriptions).map(concept => {
      const indent = "    ";
      const ensuredPreferredName = (concept.preferredName && Object.values(concept.preferredName).some(v => v && String(v).trim() !== ""))
        ? concept.preferredName!
        : { en: concept.idShort };
      return `${indent}<conceptDescription>
${indent}  <idShort>${escapeXml(concept.idShort)}</idShort>
${indent}  <id>${escapeXml(concept.id)}</id>
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
${indent}          <preferredName>
${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>en</language>
${indent}              <text>${escapeXml(concept.idShort)}</text>
${indent}            </langStringPreferredNameTypeIec61360>
${indent}          </preferredName>
${concept.shortName ? `${indent}          <shortName>
${Object.entries(concept.shortName).map(([lang, text]) => text ? `${indent}            <langStringShortNameTypeIec61360>
${indent}              <language>${lang}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringShortNameTypeIec61360>` : '').join('\n')}
${indent}          </shortName>
` : ""}${concept.unit ? `${indent}          <unit>${escapeXml(concept.unit)}</unit>
` : ""}${concept.dataType ? `${indent}          <dataType>${escapeXml(concept.dataType)}</dataType>
` : ""}${concept.description ? `${indent}          <definition>
${indent}            <langStringDefinitionTypeIec61360>
${indent}              <language>en</language>
${indent}              <text>${escapeXml(concept.description)}</text>
${indent}            </langStringDefinitionTypeIec61360>
${indent}          </definition>
` : ""}${indent}        </dataSpecificationIec61360>
${indent}      </dataSpecificationContent>
${indent}    </embeddedDataSpecification>
${indent}  </embeddedDataSpecifications>
${indent}</conceptDescription>`;
    }).join('\n');

    const submodelRefs = aasConfig.selectedSubmodels.map(sm => `        <reference>
          <type>ModelReference</type>
          <keys>
            <key>
              <type>Submodel</type>
              <value>${escapeXml(`${aasConfig.id}/submodels/${sm.idShort}`)}</value>
            </key>
          </keys>
        </reference>`).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<environment xmlns="https://admin-shell.io/aas/3/1" xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <assetAdministrationShells>
    <assetAdministrationShell>
      <idShort>${escapeXml(aasConfig.idShort)}</idShort>
      <id>${escapeXml(aasConfig.id)}</id>
      <assetInformation>
        <assetKind>${aasConfig.assetKind}</assetKind>
        <globalAssetId>${escapeXml(aasConfig.globalAssetId)}</globalAssetId>
${defaultThumbnailXml.trimEnd()}
      </assetInformation>
      <submodels>
${submodelRefs}
      </submodels>
    </assetAdministrationShell>
  </assetAdministrationShells>
  <submodels>
${submodelsXml}
  </submodels>
  <conceptDescriptions>
${conceptXml}
  </conceptDescriptions>
</environment>`;
    return xml;
  };

  const saveAAS = async () => {
    const env = buildJsonEnvironment();
    const result: ValidationResult = {
      file: `${aasConfig.idShort}.aasx`,
      type: "AASX",
      valid: true,
      processingTime: 0,
      parsed: env,
      aasData: null,
      thumbnail: thumbnail || undefined,
    };
    if (onSave) {
      onSave(result);
      toast.success("Changes saved.");
    }
  };

  // ADD: buildJsonEnvironment helper (JSON structure mirrors export)
  function buildJsonEnvironment() {
    // Helper to ensure xs:* prefix for common XML Schema types
    const prefixXs = (type?: string) => {
      if (!type) return undefined;
      const t = type.trim();
      const common = [
        'string','integer','boolean','float','double','date','dateTime','time',
        'anyURI','base64Binary','hexBinary','decimal','byte','short','int','long',
        'unsignedByte','unsignedShort','unsignedInt','unsignedLong','duration',
        'gDay','gMonth','gMonthDay','gYear','gYearMonth'
      ];
      return common.includes(t) && !t.startsWith('xs:') ? `xs:${t}` : t;
    };

    // Map UI element to AAS JSON submodelElement
    const mapElementToJson = (element: any): any => {
      const base: any = {
        idShort: element.idShort,
        modelType: element.modelType,
      };

      if (element.category) base.category = element.category;

      if (element.description) {
        const descText = typeof element.description === 'string' ? element.description : String(element.description);
        base.description = [{ language: 'en', text: descText }];
      }

      if (element.semanticId) {
        base.semanticId = {
          keys: [{ type: "GlobalReference", value: element.semanticId }]
        };
      }

      // Persist IEC 61360 metadata for visualizer
      if (element.preferredName) {
        base.preferredName = typeof element.preferredName === 'string' ? { en: element.preferredName } : element.preferredName;
      }
      if (element.shortName) {
        base.shortName = typeof element.shortName === 'string' ? { en: element.shortName } : element.shortName;
      }
      if (element.unit) {
        base.unit = element.unit;
      }
      if (element.dataType) {
        base.dataType = element.dataType;
      }
      if (element.cardinality) {
        base.cardinality = element.cardinality;
      }

      switch ((element.modelType || '').toString()) {
        case "Property":
          return {
            ...base,
            valueType: prefixXs(element.valueType || "string"),
            value: typeof element.value === 'string' ? element.value : undefined,
          };
        case "MultiLanguageProperty": {
          let valueArr: any[] = [];
          if (element.value && typeof element.value === 'object') {
            valueArr = Object.entries(element.value as Record<string, string>)
              .filter(([_, text]) => text && String(text).trim() !== '')
              .map(([language, text]) => ({ language, text }));
          }
          return { ...base, value: valueArr };
        }
        case "File":
          return {
            ...base,
            value: typeof element.value === 'string' ? element.value : '',
            contentType: element.fileData?.mimeType || 'application/octet-stream',
          };
        case "SubmodelElementCollection":
        case "SubmodelElementList":
          return {
            ...base,
            value: Array.isArray(element.children) ? element.children.map(mapElementToJson) : [],
          };
        case "ReferenceElement":
          // Keep simple form; upload/import side understands both simple and keyed forms
          return {
            ...base,
            value: element.value
          };
        default:
          return base;
      }
    };

    // Build submodels
    const jsonSubmodels = aasConfig.selectedSubmodels.map(sm => {
      const elements = submodelData[sm.idShort] || [];
      return {
        idShort: sm.idShort,
        id: `${aasConfig.id}/submodels/${sm.idShort}`,
        kind: "Instance",
        semanticId: {
          keys: [{
            type: "GlobalReference",
            value: sm.template.url || `https://admin-shell.io/submodels/${sm.idShort}`
          }]
        },
        submodelElements: elements.map(mapElementToJson),
      };
    });

    // Shell
    const jsonShell = {
      id: aasConfig.id,
      idShort: aasConfig.idShort,
      assetInformation: {
        assetKind: aasConfig.assetKind,
        globalAssetId: aasConfig.globalAssetId,
      },
      submodels: aasConfig.selectedSubmodels.map(sm => ({
        type: "ModelReference",  // ← this was missing!
        keys: [
          {
            type: "Submodel",
            value: sm.id  // ← use the actual submodel.id (the identifiable, e.g. URI)
          }
        ]
      }))
    };

    // Collect conceptDescriptions from elements with semanticId
    const collectedConcepts: Record<string, any> = {};
    const collect = (els: any[]) => {
      els.forEach(el => {
        if (el.semanticId) {
          const id = el.semanticId;
          if (!collectedConcepts[id]) {
            const preferredName = typeof el.preferredName === 'string' ? { en: el.preferredName } : el.preferredName;
            const shortName = typeof el.shortName === 'string' ? { en: el.shortName } : el.shortName;
            const definitionArr = el.description ? [{ language: "en", text: typeof el.description === 'string' ? el.description : String(el.description) }] : undefined;
            collectedConcepts[id] = {
              id,
              idShort: el.idShort,
              embeddedDataSpecifications: [
                {
                  dataSpecification: {
                    keys: [
                      { type: "GlobalReference", value: "https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360" }
                    ]
                  },
                  dataSpecificationContent: {
                    dataSpecificationIec61360: {
                      preferredName: preferredName ? Object.entries(preferredName).map(([language, text]) => ({ language, text })) : [{ language: "en", text: el.idShort }],
                      ...(shortName ? { shortName: Object.entries(shortName).map(([language, text]) => ({ language, text })) } : {}),
                      ...(el.unit ? { unit: el.unit } : {}),
                      ...(el.dataType ? { dataType: el.dataType } : {}),
                      ...(definitionArr ? { definition: definitionArr } : {}),
                    }
                  }
                }
              ]
            };
          }
        }
        if (Array.isArray(el.children) && el.children.length) collect(el.children);
      });
    };

    aasConfig.selectedSubmodels.forEach(sm => {
      const elements = submodelData[sm.idShort] || [];
      collect(elements);
    });

    return {
      assetAdministrationShells: [jsonShell],
      submodels: jsonSubmodels,
      conceptDescriptions: Object.values(collectedConcepts),
    };
  }

  const generateFinalAAS = async () => {
    setIsGenerating(true)
    
    // Helper to prefix XML schema types for valueType
    const prefixXs = (type: string | undefined) => {
      if (!type) return undefined;
      const commonTypes = ['string', 'integer', 'boolean', 'float', 'double', 'date', 'dateTime', 'time', 'anyURI', 'base64Binary', 'hexBinary', 'decimal', 'byte', 'short', 'int', 'long', 'unsignedByte', 'unsignedShort', 'unsignedInt', 'unsignedLong', 'duration', 'gDay', 'gMonth', 'gMonthDay', 'gYear', 'gYearMonth'];
      return commonTypes.includes(type) && !type.startsWith('xs:') ? `xs:${type}` : type;
    };

    try {
      // NEW: Option 1 — if the model was validated and we still have the original XML,
      // package those exact bytes instead of regenerating.
      const preferOriginalXml = hasValidated && originalXml && originalXml.trim().length > 0;
      if (preferOriginalXml) {
        // Build AASX zip with the original XML
        const zip = new JSZip();
        const xmlFileName = `${aasConfig.idShort}.xml`;
        zip.file(xmlFileName, originalXml!);
        setLastGeneratedXml(originalXml!);

        // Include a JSON model for compatibility (from current in-memory state)
        const jsonEnvironment = buildJsonEnvironment();
        zip.file("model.json", JSON.stringify(jsonEnvironment, null, 2));

        // Add any File attachments present in the editor state
        const addFilesFromElements = (elements: SubmodelElement[]) => {
          elements.forEach(element => {
            if (element.modelType === "File" && element.fileData) {
              const base64Data = element.fileData.content.split(',')[1];
              const binaryData = atob(base64Data);
              const arrayBuffer = new ArrayBuffer(binaryData.length);
              const uint8Array = new Uint8Array(arrayBuffer);
              for (let i = 0; i < binaryData.length; i++) {
                uint8Array[i] = binaryData.charCodeAt(i);
              }
              zip.file(`files/${element.fileData.fileName}`, uint8Array);
            }
            if (element.children) addFilesFromElements(element.children);
          });
        };
        aasConfig.selectedSubmodels.forEach(sm => {
          addFilesFromElements(submodelData[sm.idShort] || []);
        });

        // Add thumbnail (if present) to the root
        if (thumbnail) {
          const mimeTypeMatch = thumbnail.match(/^data:(image\/(png|jpeg|gif|svg\+xml));base64,/)
          if (mimeTypeMatch) {
            const mime = mimeTypeMatch[1];
            const ext = mimeTypeMatch[2] === 'svg+xml' ? 'svg' : mimeTypeMatch[2];
            const thumbName = `thumbnail.${ext}`;
            const base64Data = thumbnail.split(',')[1];
            const binaryData = atob(base64Data);
            const arrayBuffer = new ArrayBuffer(binaryData.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            for (let i = 0; i < binaryData.length; i++) {
              uint8Array[i] = binaryData.charCodeAt(i);
            }
            zip.file(thumbName, uint8Array);
          }
        }

        // AASX relationship structure
        zip.file("aasx/aasx-origin", `<?xml version="1.0" encoding="UTF-8"?>
<origin xmlns="http://admin-shell.io/aasx/relationships/aasx-origin">
  <originPath>/${xmlFileName}</originPath>
</origin>`);
        zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="aasx-origin" Type="http://admin-shell.io/aasx/relationships/aasx-origin" Target="/aasx/aasx-origin"/>
</Relationships>`);
        const relId = "R" + Math.random().toString(16).slice(2);
        zip.file("_rels/aasx-original.rels", `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/${xmlFileName}" Id="${relId}" /></Relationships>`);
        zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml" /><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="png" ContentType="image/png" /><Default Extension="pdf" ContentType="application/pdf" /><Default Extension="json" ContentType="text/plain" /><Override PartName="/aasx/aasx-origin" ContentType="text/plain" /></Types>`);

        // Generate ZIP blob
        const blob = await zip.generateAsync({ type: "blob" });

        // Parse like Upload so Visualizer receives consistent data
        if (onFileGenerated) {
          const aasxFile = new File([blob], `${aasConfig.idShort}.aasx`, { type: "application/zip" });
          const results = await processFile(aasxFile, () => {});
          if (results && results.length > 0) {
            onFileGenerated(results[0]);
          } else {
            onFileGenerated({
              file: aasxFile.name,
              type: "AASX",
              valid: true,
              processingTime: 0,
              parsed: null,
              aasData: null,
              thumbnail: thumbnail || undefined,
            });
          }
        }

        // Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${aasConfig.idShort}.aasx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success("AASX exported using your original XML.");
        return; // Skip generator path
      }

      // VALIDATION: only run internal validation if user hasn't already validated
      if (!hasValidated) {
        const internalValidation = validateAAS()
        if (!internalValidation.valid) {
          setInternalIssues(internalValidation.missingFields)
          toast.error(`Please fill all required fields (${internalValidation.missingFields.length} missing).`)
          console.table(internalValidation.missingFields)
          setIsGenerating(false)
          return
        }
      }
      // Clear internal validation errors after successful validation or when already validated
      setValidationErrors(new Set())
      setInternalIssues([])

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
        const normalizedType = (() => {
          const t = (element.modelType || "Property").toLowerCase();
          switch (t) {
            case "property": return "Property";
            case "multilanguageproperty": return "MultiLanguageProperty";
            case "submodelelementcollection": return "SubmodelElementCollection";
            case "submodelelementlist": return "SubmodelElementList";
            case "file": return "File";
            case "referenceelement": return "ReferenceElement";
            default: return "Property";
          }
        })();

        const tagName =
          normalizedType === "Property" ? "property" :
          normalizedType === "MultiLanguageProperty" ? "multiLanguageProperty" :
          normalizedType === "SubmodelElementCollection" ? "submodelElementCollection" :
          normalizedType === "SubmodelElementList" ? "submodelElementList" :
          normalizedType === "File" ? "file" :
          normalizedType === "ReferenceElement" ? "referenceElement" :
          "property";

        let xml = `${indent}<${tagName}>\n`;

        // Common fields
        if (element.category) {
          xml += `${indent}  <category>${escapeXml(element.category)}</category>\n`;
        }
        xml += `${indent}  <idShort>${escapeXml(element.idShort)}</idShort>\n`;

        if (element.description && String(element.description).trim() !== "") {
          const desc = typeof element.description === "string" ? element.description : String(element.description);
          xml += `${indent}  <description>\n`;
          xml += `${indent}    <langStringTextType>\n`;
          xml += `${indent}      <language>en</language>\n`;
          xml += `${indent}      <text>${escapeXml(desc)}</text>\n`;
          xml += `${indent}    </langStringTextType>\n`;
          xml += `${indent}  </description>\n`;
        }

        // Type-specific content FIRST
        if (normalizedType === "Property") {
          const vtNorm = normalizeValueType(element.valueType) || deriveValueTypeFromIEC(element.dataType) || "xs:string";
          xml += `${indent}  <valueType>${escapeXml(vtNorm)}</valueType>\n`;
          const valStr = typeof element.value === "string" ? element.value.trim() : "";
          if (valStr) {
            xml += `${indent}  <value>${escapeXml(valStr)}</value>\n`;
          } else {
            // INSERT: empty value to satisfy 3.1 sequence when neither value nor valueId exists
            xml += `${indent}  <value/>\n`;
          }
        } else if (normalizedType === "MultiLanguageProperty") {
          const hasLangValues = typeof element.value === "object" && element.value !== null && Object.values(element.value).some(text => text && String(text).trim() !== "");
          if (hasLangValues) {
            xml += `${indent}  <value>\n`;
            Object.entries(element.value as Record<string, string>).forEach(([lang, text]) => {
              if (text && String(text).trim() !== "") {
                xml += `${indent}    <langStringTextType>\n`;
                xml += `${indent}      <language>${lang}</language>\n`;
                xml += `${indent}      <text>${escapeXml(text)}</text>\n`;
                xml += `${indent}    </langStringTextType>\n`;
              }
            });
            xml += `${indent}  </value>\n`;
          } else {
            // INSERT: empty value element to satisfy schema order
            xml += `${indent}  <value/>\n`;
          }
        } else if (normalizedType === "File") {
          const contentType = element.fileData?.mimeType || "application/octet-stream";
          xml += `${indent}  <contentType>${escapeXml(contentType)}</contentType>\n`;
          const valStr = typeof element.value === "string" ? element.value.trim() : "";
          if (valStr) {
            xml += `${indent}  <value>${escapeXml(valStr)}</value>\n`;
          } else {
            // INSERT: empty value element to satisfy schema order
            xml += `${indent}  <value/>\n`;
          }
        } else if (normalizedType === "SubmodelElementCollection" || normalizedType === "SubmodelElementList") {
          if (element.children && element.children.length > 0) {
            xml += `${indent}  <value>\n`;
            element.children.forEach(child => {
              xml += generateElementXml(child, indent + "    ");
            });
            xml += `${indent}  </value>\n`;
          }
        } else if (normalizedType === "ReferenceElement") {
          const val = element.value as any;
          const hasKeys = val && typeof val === "object" && Array.isArray(val.keys);
          if (hasKeys) {
            xml += `${indent}  <value>\n`;
            xml += `${indent}    <type>${escapeXml(val.type || "ExternalReference")}</type>\n`;
            xml += `${indent}    <keys>\n`;
            (val.keys as any[]).forEach((k) => {
              xml += `${indent}      <key>\n`;
              xml += `${indent}        <type>${escapeXml(k.type || "GlobalReference")}</type>\n`;
              xml += `${indent}        <value>${escapeXml(k.value || "")}</value>\n`;
              xml += `${indent}      </key>\n`;
            });
            xml += `${indent}    </keys>\n`;
            xml += `${indent}  </value>\n`;
          } else {
            const simple = typeof val === "string" ? val.trim() : "";
            const fallback = simple || (element.semanticId || "").trim();
            if (fallback) {
              xml += `${indent}  <valueId>${escapeXml(fallback)}</valueId>\n`;
            }
          }
        }

        // semanticId NEVER on ReferenceElement
        if (element.semanticId && normalizedType !== "ReferenceElement") {
          xml += `${indent}  <semanticId>\n`;
          xml += `${indent}    <type>ExternalReference</type>\n`;
          xml += `${indent}    <keys>\n`;
          xml += `${indent}      <key>\n`;
          xml += `${indent}        <type>GlobalReference</type>\n`;
          xml += `${indent}        <value>${escapeXml(element.semanticId)}</value>\n`;
          xml += `${indent}      </key>\n`;
          xml += `${indent}    </keys>\n`;
          xml += `${indent}  </semanticId>\n`;
        }

        // Embedded Data Specifications (IEC 61360)
        const hasIECMeta =
          (typeof element.preferredName === "string" && element.preferredName.trim() !== "") ||
          (typeof element.preferredName === "object" && element.preferredName && Object.values(element.preferredName).some(v => v && String(v).trim() !== "")) ||
          (typeof element.shortName === "string" && element.shortName.trim() !== "") ||
          (typeof element.shortName === "object" && element.shortName && Object.values(element.shortName).some(v => v && String(v).trim() !== "")) ||
          (element.unit && element.unit.trim() !== "") ||
          (element.dataType && element.dataType.trim() !== "") ||
          (element.description && String(element.description).trim() !== "");

        if (hasIECMeta) {
          const prefNames = typeof element.preferredName === "string" ? { en: element.preferredName } : (element.preferredName || {});
          const shortNames = typeof element.shortName === "string" ? { en: element.shortName } : (element.shortName || {});
          const preferredNameXml = Object.entries(prefNames as Record<string, string>)
            .filter(([_, text]) => text && String(text).trim() !== "")
            .map(([lang, text]) =>
              `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>${lang}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringPreferredNameTypeIec61360>
`).join("");
          const hasShortNames = shortNames && Object.values(shortNames as Record<string, string>).some(v => v && String(v).trim() !== "");
          const shortNameXml = hasShortNames
            ? Object.entries(shortNames as Record<string, string>)
                .filter(([_, text]) => text && String(text).trim() !== "")
                .map(([lang, text]) =>
                  `${indent}            <langStringShortNameTypeIec61360>
${indent}              <language>${lang}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringShortNameTypeIec61360>
`).join("")
            : "";

          xml += `${indent}  <embeddedDataSpecifications>\n`;
          xml += `${indent}    <embeddedDataSpecification>\n`;
          xml += `${indent}      <dataSpecification>\n`;
          xml += `${indent}        <type>ExternalReference</type>\n`;
          xml += `${indent}        <keys>\n`;
          xml += `${indent}          <key>\n`;
          xml += `${indent}            <type>GlobalReference</type>\n`;
          xml += `${indent}            <value>https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360</value>\n`;
          xml += `${indent}          </key>\n`;
          xml += `${indent}        </keys>\n`;
          xml += `${indent}      </dataSpecification>\n`;
          xml += `${indent}      <dataSpecificationContent>\n`;
          xml += `${indent}        <dataSpecificationIec61360>\n`;
          xml += `${indent}          <preferredName>\n`;
          xml += preferredNameXml && preferredNameXml.trim().length > 0
            ? preferredNameXml
            : `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>en</language>
${indent}              <text>${escapeXml(element.idShort)}</text>
${indent}            </langStringPreferredNameTypeIec61360>
`;
          xml += `${indent}          </preferredName>\n`;
          if (hasShortNames) {
            xml += `${indent}          <shortName>\n`;
            xml += shortNameXml;
            xml += `${indent}          </shortName>\n`;
          }
          if (element.unit && element.unit.trim() !== "") {
            xml += `${indent}          <unit>${escapeXml(element.unit)}</unit>\n`;
          }
          if (element.dataType && element.dataType.trim() !== "") {
            xml += `${indent}          <dataType>${escapeXml(element.dataType)}</dataType>\n`;
          }
          if (element.description && String(element.description).trim() !== "") {
            const desc2 = typeof element.description === "string" ? element.description : String(element.description);
            xml += `${indent}          <definition>\n`;
            xml += `${indent}            <langStringDefinitionTypeIec61360>\n`;
            xml += `${indent}              <language>en</language>\n`;
            xml += `${indent}              <text>${escapeXml(desc2)}</text>\n`;
            xml += `${indent}            </langStringDefinitionTypeIec61360>\n`;
            xml += `${indent}          </definition>\n`;
          }
          xml += `${indent}        </dataSpecificationIec61360>\n`;
          xml += `${indent}      </dataSpecificationContent>\n`;
          xml += `${indent}    </embeddedDataSpecification>\n`;
          xml += `${indent}  </embeddedDataSpecifications>\n`;
        }

        xml += `${indent}</${tagName}>\n`;
        return xml;
      };

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
<environment xmlns="https://admin-shell.io/aas/3/1" xmlns:xs="http://www.w3.org/2001/XMLSchema"> <!-- Updated namespace to 3/1 and declared xs prefix -->
  <assetAdministrationShells>
    <assetAdministrationShell>
      <idShort>${escapeXml(aasConfig.idShort)}</idShort>
      <id>${escapeXml(aasConfig.id)}</id>
      <assetInformation>
        <assetKind>${aasConfig.assetKind}</assetKind>
        <globalAssetId>${escapeXml(aasConfig.globalAssetId)}</globalAssetId>
${defaultThumbnailXml}      </assetInformation>
      <submodels>
${aasConfig.selectedSubmodels.map(sm => `        <reference>
          <type>ModelReference</type>
          <keys>
            <key>
              <type>Submodel</type>
              <value>${escapeXml(`${aasConfig.id}/submodels/${sm.idShort}`)}</value>
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
      <idShort>${escapeXml(sm.idShort)}</idShort>
      <id>${escapeXml(`${aasConfig.id}/submodels/${sm.idShort}`)}</id>
      <kind>Instance</kind>
      <semanticId>
        <type>ExternalReference</type>
        <keys>
          <key>
            <type>GlobalReference</type>
            <value>${escapeXml(sm.template.url || ('https://admin-shell.io/submodels/' + sm.idShort))}</value>
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
    // Ensure preferredName is present and ordered first (fallback to idShort)
    const ensuredPreferredName = (concept.preferredName && Object.values(concept.preferredName).some(v => v && String(v).trim() !== ""))
      ? concept.preferredName
      : { en: concept.idShort };

    return `${indent}<conceptDescription>
${indent}  <idShort>${escapeXml(concept.idShort)}</idShort>
${indent}  <id>${escapeXml(concept.id)}</id>
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
${indent}          <preferredName>
${Object.entries(ensuredPreferredName).map(([lang, text]) => text ? `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>${lang}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringPreferredNameTypeIec61360>` : '').join('\n')}
${indent}          </preferredName>
${concept.shortName ? `${indent}          <shortName>
${Object.entries(concept.shortName).map(([lang, text]) => text ? `${indent}            <langStringShortNameTypeIec61360>
${indent}              <language>${lang}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringShortNameTypeIec61360>` : '').join('\n')}
${indent}          </shortName>\n` : ''}
${concept.unit ? `${indent}          <unit>${escapeXml(concept.unit)}</unit>\n` : ''}
${concept.dataType ? `${indent}          <dataType>${escapeXml(concept.dataType)}</dataType>\n` : ''}
${concept.description ? `${indent}          <definition>
${indent}            <langStringDefinitionTypeIec61360>
${indent}              <language>en</language>
${indent}              <text>${escapeXml(concept.description)}</text>
${indent}            </langStringDefinitionTypeIec61360>
${indent}          </definition>
` : ""}${indent}        </dataSpecificationIec61360>
${indent}      </dataSpecificationContent>
${indent}    </embeddedDataSpecification>
${indent}  </embeddedDataSpecifications>
${indent}</conceptDescription>`
  }).join('\n')}
  </conceptDescriptions>
</environment>`

      // Store for debugging and perform XML schema validation
      setLastGeneratedXml(aasXml)
      console.log("[v0] EDITOR: Starting XML schema validation for generated AAS...")
      const xmlValidationResult = await validateAASXXml(aasXml)

      if (!xmlValidationResult.valid) {
        // ADD: surface XML schema errors panel + toast
        const errs = Array.isArray(xmlValidationResult.errors) ? xmlValidationResult.errors.map((e: any) => (typeof e === 'string' ? e : e.message || String(e))) : ['Unknown XML validation error']
        setExternalIssues(errs)
        toast.error(`Generated XML is invalid (${errs.length} errors). See details below.`)
        console.table(xmlValidationResult.errors)
        setIsGenerating(false)
        return
      }
      console.log("[v0] EDITOR: XML schema validation PASSED.")
      setExternalIssues([]) // ADD: clear XML errors on success

      // Create AASX file (ZIP format)
      try {
        const zip = new JSZip()
        
        // Add the main AAS XML file
        const xmlFileName = `${aasConfig.idShort}.xml`
        zip.file(xmlFileName, aasXml)

        // ALSO: create a JSON version and add as model.json for compatibility
        const mapElementToJson = (element: SubmodelElement): any => {
          const base: any = {
            idShort: element.idShort,
            modelType: element.modelType,
          };
          if (element.category) base.category = element.category;
          if (element.description) {
            const descText = typeof element.description === 'string' ? element.description : String(element.description);
            base.description = [{ language: 'en', text: descText }];
          }
          if (element.semanticId) {
            base.semanticId = {
              keys: [{ type: "GlobalReference", value: element.semanticId }]
            };
          }
          // Persist metadata directly for the visualizer
          if (element.preferredName) {
            base.preferredName = typeof element.preferredName === 'string' ? { en: element.preferredName } : element.preferredName;
          }
          if (element.shortName) {
            base.shortName = typeof element.shortName === 'string' ? { en: element.shortName } : element.shortName;
          }
          if (element.unit) {
            base.unit = element.unit;
          }
          if (element.dataType) {
            base.dataType = element.dataType;
          }
          if (element.cardinality) {
            base.cardinality = element.cardinality;
          }

          switch (element.modelType) {
            case "Property":
              return {
                ...base,
                valueType: prefixXs(element.valueType || "string"),
                value: typeof element.value === 'string' ? element.value : undefined,
              };
            case "MultiLanguageProperty": {
              let valueArr: any[] = [];
              if (element.value && typeof element.value === 'object') {
                valueArr = Object.entries(element.value as Record<string, string>)
                  .filter(([_, text]) => text && String(text).trim() !== '')
                  .map(([language, text]) => ({ language, text }));
              }
              return {
                ...base,
                value: valueArr,
              };
            }
            case "File":
              return {
                ...base,
                value: typeof element.value === 'string' ? element.value : '',
                contentType: element.fileData?.mimeType || 'application/octet-stream',
              };
            case "SubmodelElementCollection":
            case "SubmodelElementList":
              return {
                ...base,
                value: Array.isArray(element.children) ? element.children.map(mapElementToJson) : [],
              };
            default:
              return base;
          }
        };

        const jsonSubmodels = aasConfig.selectedSubmodels.map(sm => {
          const elements = submodelData[sm.idShort] || [];
          return {
            idShort: sm.idShort,
            id: `${aasConfig.id}/submodels/${sm.idShort}`,
            kind: "Instance",
            semanticId: {
              keys: [{
                type: "GlobalReference",
                value: sm.template.url || `https://admin-shell.io/submodels/${sm.idShort}`
              }]
            },
            submodelElements: elements.map(mapElementToJson),
          };
        });

        const jsonShell = {
          id: aasConfig.id,
          idShort: aasConfig.idShort,
          assetInformation: {
            assetKind: aasConfig.assetKind,
            globalAssetId: aasConfig.globalAssetId,
          },
          submodels: aasConfig.selectedSubmodels.map(sm => ({
            keys: [{
              type: "Submodel",
              value: `${aasConfig.id}/submodels/${sm.idShort}`
            }]
          })),
        };

        // Build conceptDescriptions (compact IEC 61360 JSON)
        const jsonConceptDescriptions = Object.values(collectedConceptDescriptions).map(concept => {
          const ensuredPreferredName = (concept.preferredName && Object.values(concept.preferredName).some(v => v && String(v).trim() !== ""))
            ? concept.preferredName!
            : { en: concept.idShort };
          const preferredNameArr = Object.entries(ensuredPreferredName).map(([language, text]) => ({ language, text }));
          const shortNameArr = concept.shortName
            ? Object.entries(concept.shortName).map(([language, text]) => ({ language, text }))
            : undefined;
          const definitionArr = concept.description
            ? [{ language: "en", text: concept.description }]
            : undefined;

          return {
            id: concept.id,
            idShort: concept.idShort,
            embeddedDataSpecifications: [
              {
                dataSpecification: {
                  keys: [
                    { type: "GlobalReference", value: "https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360" }
                  ]
                },
                dataSpecificationContent: {
                  dataSpecificationIec61360: {
                    preferredName: preferredNameArr,
                    ...(shortNameArr && { shortName: shortNameArr }),
                    ...(concept.unit && { unit: concept.unit }),
                    ...(concept.dataType && { dataType: concept.dataType }),
                    ...(definitionArr && { definition: definitionArr })
                  }
                }
              }
            ]
          };
        });

        const jsonEnvironment = {
          assetAdministrationShells: [jsonShell],
          submodels: jsonSubmodels,
          conceptDescriptions: jsonConceptDescriptions
        };

        zip.file("model.json", JSON.stringify(jsonEnvironment, null, 2));

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

        // ADD: [Content_Types].xml (OPC) and _rels/aasx-original.rels pointing to main AAS XML
        const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml" /><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="png" ContentType="image/png" /><Default Extension="pdf" ContentType="application/pdf" /><Default Extension="json" ContentType="text/plain" /><Override PartName="/aasx/aasx-origin" ContentType="text/plain" /></Types>`;
        zip.file("[Content_Types].xml", contentTypesXml);

        const relId = "R" + Math.random().toString(16).slice(2);
        const aasxOriginalRels = `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/${xmlFileName}" Id="${relId}" /></Relationships>`;
        zip.file("_rels/aasx-original.rels", aasxOriginalRels);

        // Generate ZIP file
        const blob = await zip.generateAsync({ type: "blob" })
        
        console.log("[v0] AASX file (XML + model.json) generated successfully")

        // Parse the generated AASX just like the Upload tab does, so Visualizer receives real data
        if (onFileGenerated) {
          const aasxFile = new File([blob], `${aasConfig.idShort}.aasx`, { type: "application/zip" })
          const results = await processFile(aasxFile, () => {})
          if (results && results.length > 0) {
            onFileGenerated(results[0])
          } else {
            onFileGenerated({
              file: aasxFile.name,
              type: "AASX",
              valid: true,
              processingTime: 0,
              parsed: null,
              aasData: null,
              thumbnail: thumbnail || undefined,
            })
          }
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
        
        // ADD: success toast
        toast.success("AASX file generated successfully.")
        
      } catch (error) {
        console.error("[v0] Error generating AASX file:", error)
        toast.error("Failed to generate AASX file. Please try again.")
      }
    } catch (error) {
      console.error("[v0] Error generating AASX file:", error)
      toast.error("Failed to generate AASX file. Please try again.")
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

        // NEW: Property must have valueType or IEC Data Type
        if (element.modelType === "Property") {
          const hasValueType = !!normalizeValueType(element.valueType);
          const hasIECType = !!element.dataType && String(element.dataType).trim() !== "";
          if (!hasValueType && !hasIECType) {
            missingFields.push(`${submodelId} > ${currentPath.join(' > ')} (set Value Type or IEC Data Type)`);
            errors.add(nodeId);
            for (let i = 0; i < currentPath.length - 1; i++) {
              const parentPath = currentPath.slice(0, i + 1).join('.');
              nodesToExpand.add(parentPath);
            }
          }

          // ADD: value must match declared xs:* type
          const vtNorm = normalizeValueType(element.valueType) || deriveValueTypeFromIEC(element.dataType);
          if (vtNorm && typeof element.value === 'string' && element.value.trim() !== '') {
            if (!isValidValueForXsdType(vtNorm, element.value)) {
              missingFields.push(`${submodelId} > ${currentPath.join(' > ')} (value "${element.value}" doesn't match ${vtNorm})`);
              errors.add(nodeId);
              for (let i = 0; i < currentPath.length - 1; i++) {
                const parentPath = currentPath.slice(0, i + 1).join('.');
                nodesToExpand.add(parentPath);
              }
            }
          }
        }
        
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
            hasValue = (element.children && element.children.length > 0)
          } else if (element.modelType === "File") {
            // NEW: File required -> need a path or uploaded file
            hasValue = (typeof element.value === 'string' && element.value.trim() !== '') || !!element.fileData
          }
          
          if (!hasValue && (element.modelType === "Property" || element.modelType === "MultiLanguageProperty" || element.modelType === "SubmodelElementCollection" || element.modelType === "SubmodelElementList" || element.modelType === "File")) {
            missingFields.push(`${submodelId} > ${currentPath.join(' > ')}`)
            errors.add(nodeId)
            
            for (let i = 0; i < currentPath.length - 1; i++) {
              const parentPath = currentPath.slice(0, i + 1).join('.')
              nodesToExpand.add(parentPath)
            }
          }
        }
        
        if (element.children && element.children.length > 0) {
          validateElements(element.children, submodelId, currentPath)
        }
      })
    }
    
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
      // FIX: corrected variable name
      const newAASConfig = { ...aasConfig, selectedSubmodels: updatedSelectedSubmodels };
      
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

  // ADD: helper to navigate to a missing field path like "SubmodelId > A > B > C"
  const goToIssuePath = (issue: string) => {
    const parts = issue.split('>').map(p => p.trim()).filter(Boolean)
    if (parts.length < 2) return
    const submodelId = parts[0]
    const pathSegments = parts.slice(1)

    const sm = aasConfig.selectedSubmodels.find(s => s.idShort === submodelId)
    if (!sm) return

    setSelectedSubmodel(sm)

    // Expand nodes along the path
    const newExpanded = new Set(expandedNodes)
    const cumulative: string[] = []
    pathSegments.forEach(seg => {
      cumulative.push(seg)
      newExpanded.add(cumulative.join('.'))
    })
    setExpandedNodes(newExpanded)

    // Find element by path and select it
    const elements = submodelData[submodelId] || []
    const findByPath = (els: SubmodelElement[], path: string[], idx = 0): SubmodelElement | null => {
      if (idx >= path.length) return null
      const cur = els.find(e => e.idShort === path[idx])
      if (!cur) return null
      if (idx === path.length - 1) return cur
      return cur.children ? findByPath(cur.children, path, idx + 1) : null
    }
    const target = findByPath(elements, pathSegments)
    if (target) setSelectedElement(target)
  }

  // NEW: find the first path for a given idShort across all submodels
  const findFirstPathForIdShort = (needle: string): string | null => {
    for (const sm of aasConfig.selectedSubmodels) {
      const submodelId = sm.idShort
      const walk = (els: SubmodelElement[], chain: string[] = []): string | null => {
        for (const el of els || []) {
          const curChain = [...chain, el.idShort]
          if (el.idShort === needle) return `${submodelId} > ${curChain.join(' > ')}`
          if (Array.isArray(el.children) && el.children.length > 0) {
            const found = walk(el.children, curChain)
            if (found) return found
          }
        }
        return null
      }
      const res = walk(submodelData[submodelId] || [], [])
      if (res) return res
    }
    return null
  }

  // NEW: gather paths for ReferenceElements missing keys to enable Go to buttons
  const findReferenceElementsMissingKeys = (): string[] => {
    const paths: string[] = []
    const walk = (els: SubmodelElement[], smId: string, chain: string[] = []) => {
      els.forEach((el) => {
        const nextChain = [...chain, el.idShort]
        if (el.modelType === "ReferenceElement") {
          const v: any = el.value
          const missing = !v || typeof v !== "object" || !Array.isArray(v.keys) || v.keys.length === 0
          if (missing) {
            paths.push(`${smId} > ${nextChain.join(' > ')}`)
          }
        }
        if (Array.isArray(el.children) && el.children.length) {
          walk(el.children, smId, nextChain)
        }
      })
    }
    aasConfig.selectedSubmodels.forEach((sm) => {
      walk(submodelData[sm.idShort] || [], sm.idShort, [])
    })
    return paths
  }

  // NEW: find the first element path that has a semanticId (to help fix conceptDescriptions error)
  const findFirstSemanticElementPath = (): string | null => {
    for (const sm of aasConfig.selectedSubmodels) {
      const submodelId = sm.idShort
      const walk = (els: SubmodelElement[], chain: string[] = []): string | null => {
        for (const el of els || []) {
          const curChain = [...chain, el.idShort]
          if (el.semanticId && String(el.semanticId).trim() !== "") {
            return `${submodelId} > ${curChain.join(' > ')}`
          }
          if (Array.isArray(el.children) && el.children.length > 0) {
            const found = walk(el.children, curChain)
            if (found) return found
          }
        }
        return null
      }
      const res = walk(submodelData[submodelId] || [], [])
      if (res) return res
    }
    return null
  }

  // ADD: manual validate action (internal)
  const runInternalValidation = async () => {
    // Our internal required-fields/type checks
    const internal = validateAAS();
    setInternalIssues(internal.missingFields);

    // Build JSON for structural validation
    const env = buildJsonEnvironment();
    const jsonResult = await validateAASXJson(JSON.stringify(env));

    // Prefer original uploaded XML if available
    const xmlBuilt = originalXml && originalXml.trim().length > 0 ? originalXml : buildCurrentXml();
    setLastGeneratedXml(xmlBuilt);
    const xmlResult = await validateAASXXml(xmlBuilt);

    // Preserve raw XML errors so we can show line number + friendlier hints
    const rawErrors = (xmlResult as any)?.errors || [];
    setXmlErrorsRaw(Array.isArray(rawErrors) ? rawErrors : []);
    // Also keep a normalized string list for legacy UI bits
    const xmlErrorsNormalized = Array.isArray(rawErrors)
      ? rawErrors.map((e: any) => (typeof e === 'string' ? e : (e?.message || String(e))))
      : [];
    setExternalIssues(xmlErrorsNormalized);

    const jsonErrCount = (jsonResult as any)?.errors?.length || 0;
    const xmlErrCount = Array.isArray(rawErrors) ? rawErrors.length : xmlErrorsNormalized.length;
    const internalCount = internal.missingFields.length;

    const allGood = internalCount === 0 && jsonResult.valid && xmlResult.valid;

    // Open validation result popup
    setValidationCounts({ internal: internalCount, json: jsonErrCount, xml: xmlErrCount });
    setValidationDialogStatus(allGood ? 'valid' : 'invalid');
    setValidationDialogOpen(true);
    setCanGenerate(allGood);

    setHasValidated(true);
  };

  const setAASFieldValue = (field: 'idShort'|'id'|'assetKind'|'globalAssetId', value: string) => {
    onUpdateAASConfig({ ...aasConfig, [field]: value })
  }

  const copyText = async (label: string, value?: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  }

  // NEW: list paths for required elements with empty values
  const listRequiredEmptyValuePaths = (): string[] => {
    const paths: string[] = [];
    const isReq = (c: SubmodelElement["cardinality"]) => c === "One" || c === "OneToMany";

    const walk = (els: SubmodelElement[], smId: string, chain: string[] = []) => {
      els.forEach((el) => {
        const nextChain = [...chain, el.idShort];
        if (isReq(el.cardinality)) {
          let empty = false;
          if (el.modelType === "Property") {
            empty = !(typeof el.value === "string" && el.value.trim() !== "");
          } else if (el.modelType === "MultiLanguageProperty") {
            const obj = el.value && typeof el.value === "object" ? el.value as Record<string, string> : {};
            const hasAny = Object.values(obj).some((t) => t && String(t).trim() !== "");
            empty = !hasAny;
          } else if (el.modelType === "SubmodelElementCollection" || el.modelType === "SubmodelElementList") {
            empty = !(Array.isArray(el.children) && el.children.length > 0);
          }
          if (empty) paths.push(`${smId} > ${nextChain.join(" > ")}`);
        }
        if (Array.isArray(el.children) && el.children.length) walk(el.children, smId, nextChain);
      });
    };

    aasConfig.selectedSubmodels.forEach((sm) => {
      walk(submodelData[sm.idShort] || [], sm.idShort, []);
    });

    return paths;
  };

  // NEW: gather paths with empty Description fields
  const listEmptyDescriptionPaths = (): string[] => {
    const paths: string[] = [];

    const walk = (els: SubmodelElement[], smId: string, chain: string[] = []) => {
      els.forEach((el) => {
        const nextChain = [...chain, el.idShort];
        const hasDescField = el.description != null;
        const isEmpty = typeof el.description === "string" ? el.description.trim() === "" : !el.description;
        if (hasDescField && isEmpty) {
          paths.push(`${smId} > ${nextChain.join(" > ")}`);
        }
        if (Array.isArray(el.children) && el.children.length) walk(el.children, smId, nextChain);
      });
    };

    aasConfig.selectedSubmodels.forEach((sm) => {
      walk(submodelData[sm.idShort] || [], sm.idShort, []);
    });

    return paths;
  };

  // NEW: auto-fill placeholders for required empty values (safe, minimal placeholders)
  const autoFillRequiredValues = () => {
    const choosePlaceholder = (el: SubmodelElement): string | undefined => {
      const vt = normalizeValueType(el.valueType) || deriveValueTypeFromIEC(el.dataType);
      switch (vt) {
        case "xs:boolean": return "false";
        case "xs:integer":
        case "xs:int":
        case "xs:long":
        case "xs:short":
        case "xs:byte":
        case "xs:unsignedLong":
        case "xs:unsignedInt":
        case "xs:unsignedShort":
        case "xs:unsignedByte":
        case "xs:float":
        case "xs:double":
        case "xs:decimal":
          return "0";
        case "xs:anyURI": return "about:blank";
        default: return "—"; // simple, non-ambiguous string placeholder
      }
    };

    setSubmodelData((prev) => {
      const next = { ...prev };

      const fill = (els: SubmodelElement[]) => {
        return els.map((el) => {
          // Only fill Property, MLP, File
          if ((el.cardinality === "One" || el.cardinality === "OneToMany")) {
            if (el.modelType === "Property") {
              const cur = typeof el.value === "string" ? el.value : "";
              if (!cur || cur.trim() === "") {
                const ph = choosePlaceholder(el);
                if (ph != null) {
                  return { ...el, value: ph };
                }
              }
            } else if (el.modelType === "MultiLanguageProperty") {
              const obj = el.value && typeof el.value === "object" ? { ...(el.value as Record<string, string>) } : {};
              const hasAny = Object.values(obj).some((t) => t && String(t).trim() !== "");
              if (!hasAny) {
                obj.en = obj.en && obj.en.trim() !== "" ? obj.en : "—";
                return { ...el, value: obj };
              }
            } else if (el.modelType === "File") {
              const cur = typeof el.value === "string" ? el.value : "";
              if ((!cur || cur.trim() === "") && !el.fileData) {
                // NEW: set a minimal safe URI placeholder
                return { ...el, value: "about:blank" };
              }
            }
          }
          if (Array.isArray(el.children) && el.children.length) {
            return { ...el, children: fill(el.children) };
          }
          return el;
        });
      };

      aasConfig.selectedSubmodels.forEach((sm) => {
        next[sm.idShort] = fill(next[sm.idShort] || []);
      });

      return next;
    });

    toast.success("Filled placeholders for required values.");
  };

  // NEW: remove all empty Description fields
  const removeEmptyDescriptionsAll = () => {
    setSubmodelData((prev) => {
      const next = { ...prev };
      const clean = (els: SubmodelElement[]): SubmodelElement[] => {
        return els.map((el) => {
          const hasDescField = el.description != null;
          const isEmpty = typeof el.description === "string" ? el.description.trim() === "" : !el.description;
          const cleaned = hasDescField && isEmpty ? { ...el, description: undefined } : el;
          if (Array.isArray(cleaned.children) && cleaned.children.length) {
            return { ...cleaned, children: clean(cleaned.children) };
          }
          return cleaned;
        });
      };
      aasConfig.selectedSubmodels.forEach((sm) => {
        next[sm.idShort] = clean(next[sm.idShort] || []);
      });
      return next;
    });
    toast.success("Removed empty descriptions.");
    // Auto re-validate against current editor state
    runInternalValidation();
  };

  // NEW: find the first element path that has an empty Description (for XML friendly error hints)
  const findFirstEmptyDescriptionPath = (): string | null => {
    for (const sm of aasConfig.selectedSubmodels) {
      const submodelId = sm.idShort;
      const walk = (els: SubmodelElement[], chain: string[] = []): string | null => {
        for (const el of els || []) {
          const curChain = [...chain, el.idShort];
          const hasDescField = el.description != null;
          const isEmpty =
            typeof el.description === "string"
              ? el.description.trim() === ""
              : !el.description;

          if (hasDescField && isEmpty) {
            return `${submodelId} > ${curChain.join(" > ")}`;
          }

          if (Array.isArray(el.children) && el.children.length > 0) {
            const found = walk(el.children, curChain);
            if (found) return found;
          }
        }
        return null;
      };

      const res = walk(submodelData[submodelId] || [], []);
      if (res) return res;
    }
    return null;
  };

  // NEW: detect empty descriptions directly from the last generated XML preview
  const listXmlEmptyDescriptionPaths = (): string[] => {
    if (!lastGeneratedXml) return []
    try {
      const doc = new DOMParser().parseFromString(lastGeneratedXml, "application/xml")
      const parserError = doc.querySelector("parsererror")
      if (parserError) return []

      const paths: string[] = []
      const submodels = Array.from(doc.getElementsByTagName("submodel"))
      submodels.forEach((smEl) => {
        const smIdShort = smEl.querySelector(":scope > idShort")?.textContent?.trim() || "Submodel"

        // Submodel-level description empty
        const smDesc = smEl.querySelector(":scope > description")
        if (smDesc && smDesc.children.length === 0) {
          paths.push(`${smIdShort} > (submodel description)`)
        }

        const smeContainer = smEl.querySelector(":scope > submodelElements")
        const children = smeContainer ? Array.from(smeContainer.children) : []
        children.forEach((sme) => {
          const idShort = sme.querySelector(":scope > idShort")?.textContent?.trim() || "Element"
          const desc = sme.querySelector(":scope > description")
          if (desc && desc.children.length === 0) {
            paths.push(`${smIdShort} > ${idShort}`)
          }
        })
      })

      return paths
    } catch {
      return []
    }
  }

  // NEW: easy one-click fixer for safe changes
  const fixAllSafe = async () => {
    autoFillRequiredValues();
    removeEmptyDescriptionsAll();
    // Re-validate after state updates settle
    setTimeout(() => runInternalValidation(), 0);
  }

  // NEW: pick the next fixable path for the "Fix next" button
  const firstFixPath = (): string | null => {
    // 1) Prioritize internal required/type issues
    if (internalIssues.length > 0) return internalIssues[0];

    // 2) Try friendly XML errors if available and they provide a path
    try {
      const source = xmlErrorsRaw.length ? xmlErrorsRaw : externalIssues;
      const friendly = buildFriendlyXmlErrors(source as any);
      const withPath = Array.isArray(friendly) ? friendly.find((fe: any) => fe?.path) : null;
      if (withPath?.path) return withPath.path as string;
    } catch {
      // ignore
    }

    // 3) ReferenceElements missing keys
    const refMissing = findReferenceElementsMissingKeys();
    if (Array.isArray(refMissing) && refMissing.length > 0) return refMissing[0];

    // 4) First element with semanticId
    const semantic = findFirstSemanticElementPath();
    if (semantic) return semantic;

    // 5) Required elements with empty values
    const reqEmpty = listRequiredEmptyValuePaths();
    if (Array.isArray(reqEmpty) && reqEmpty.length > 0) return reqEmpty[0];

    // 6) Empty descriptions
    const descEmpty = listEmptyDescriptionPaths();
    if (Array.isArray(descEmpty) && descEmpty.length > 0) return descEmpty[0];

    // 7) XML-derived empty descriptions (if present)
    const descXml = listXmlEmptyDescriptionPaths();
    if (Array.isArray(descXml) && descXml.length > 0) return descXml[0];

    return null;
  }

  // NEW: Friendly XML error formatter (local helper) — now includes line numbers and guessed path
  type FriendlyXmlError = { message: string; hint?: string; path?: string };

  function buildFriendlyXmlErrors(errs: (string | { message?: string; loc?: { lineNumber?: number } })[]): FriendlyXmlError[] {
    return (errs || []).map((raw) => {
      const text = typeof raw === "string" ? raw : (raw?.message ? String(raw.message) : String(raw));
      const lower = text.toLowerCase();

      let msg = text;
      let hint: string | undefined;
      let path: string | undefined;

      // Derive path from line number using the last generated XML
      const line = typeof raw === "object" ? (raw?.loc?.lineNumber ?? undefined) : undefined;
      if (line && lastGeneratedXml) {
        const guessed = guessPathFromXmlLine(lastGeneratedXml, line);
        if (guessed) path = guessed;
        // Append "(Line N)" for quick reference
        msg = `${msg} (Line ${line})`;
      }

      if (lower.includes("minlength") && lower.includes("{https://admin-shell.io/aas/3/1}value")) {
        hint = "Provide a non-empty value or remove the empty <value/> for required elements.";
      } else if (lower.includes("displayname") && lower.includes("langstringnametype")) {
        hint = "Add a language-tagged displayName entry (e.g., langStringNameType with language=en).";
      } else if (lower.includes("description") && lower.includes("langstringtexttype")) {
        hint = "Descriptions must include langStringTextType; add language and text.";
      } else if (lower.includes("embeddeddataspecifications") && lower.includes("embeddeddataspecification")) {
        hint = "If embeddedDataSpecifications is present, it must contain at least one embeddedDataSpecification.";
      } else if (lower.includes("definition") && lower.includes("langstringdefinitiontypeiec61360")) {
        hint = "IEC61360 definition must include langStringDefinitionTypeIec61360 with language and text.";
      } else if (lower.includes("valuereferencepairs") && lower.includes("valuereferencepair")) {
        hint = "Value list must include at least one valueReferencePair entry or remove the empty list.";
      } else if (lower.includes("valuetype") || lower.includes("sequence")) {
        hint = "Ensure valueType appears before value for Property / MultiLanguageProperty.";
      } else if (lower.includes("contenttype") && lower.includes("file")) {
        hint = "File elements must include contentType and a valid value (path or URL).";
      } else if (lower.includes("semanticid")) {
        hint = "Use ExternalReference with keys -> GlobalReference -> value containing the semantic ID.";
      }

      return { message: msg, hint, path };
    });
  }

  // NEW: guess a model path from an XML line by scanning for nearby idShorts
  function guessPathFromXmlLine(xml: string, lineNumber: number): string | null {
    try {
      const lines = xml.split(/\r?\n/);
      const idx = Math.max(0, Math.min(lines.length - 1, (lineNumber || 1) - 1));
      const start = Math.max(0, idx - 80);
      const end = Math.min(lines.length - 1, idx + 20);
      const windowText = lines.slice(start, end + 1).join("\n");

      const idShortRegex = /<idShort>([^<]+)<\/idShort>/g;
      const submodelRegex = /<submodel>([\s\S]*?)<\/submodel>/g;
      const conceptRegex = /<conceptDescription>([\s\S]*?)<\/conceptDescription>/g;

      const lastIdShorts: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = idShortRegex.exec(windowText))) {
        lastIdShorts.push(m[1].trim());
      }

      // Try conceptDescription context first
      let conceptMatch: RegExpExecArray | null = null;
      while ((m = conceptRegex.exec(windowText))) {
        conceptMatch = m;
      }
      if (conceptMatch) {
        const idsInConcept: string[] = [];
        const local = conceptMatch[1];
        let cm: RegExpExecArray | null;
        const re = /<idShort>([^<]+)<\/idShort>/g;
        while ((cm = re.exec(local))) idsInConcept.push(cm[1].trim());
        if (idsInConcept.length > 0) {
          return `Concept > ${idsInConcept[idsInConcept.length - 1]}`;
        }
      }

      // Try submodel context
      let submodelMatch: RegExpExecArray | null = null;
      while ((m = submodelRegex.exec(windowText))) {
        submodelMatch = m;
      }
      if (submodelMatch) {
        const idsInSubmodel: string[] = [];
        const local = submodelMatch[1];
        let sm: RegExpExecArray | null;
        const re = /<idShort>([^<]+)<\/idShort>/g;
        while ((sm = re.exec(local))) idsInSubmodel.push(sm[1].trim());
        const submodelIdShort = idsInSubmodel.length > 0 ? idsInSubmodel[0] : null;
        const elementIdShort = idsInSubmodel.length > 1 ? idsInSubmodel[idsInSubmodel.length - 1] : null;
        if (submodelIdShort && elementIdShort && submodelIdShort !== elementIdShort) {
          return `${submodelIdShort} > ${elementIdShort}`;
        }
        if (submodelIdShort) return submodelIdShort;
      }

      // Fallback: last idShort in window
      if (lastIdShorts.length > 0) {
        const leaf = lastIdShorts[lastIdShorts.length - 1];
        const parent = lastIdShorts.length > 1 ? lastIdShorts[lastIdShorts.length - 2] : null;
        if (parent && parent !== leaf) return `${parent} > ${leaf}`;
        return leaf;
      }

      return null;
    } catch {
      return null;
    }
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Back to Home"
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
            {/* AAS Info inline grid */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* IdShort */}
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-gray-600 dark:text-gray-400">IdShort</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={aasConfig.idShort || ""}
                    onChange={(e) => setAASFieldValue('idShort', e.target.value)}
                    className="h-9"
                    disabled={!editMode}
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('IdShort', aasConfig.idShort)} title="Copy IdShort">
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              {/* ID */}
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-gray-600 dark:text-gray-400">ID</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={aasConfig.id || ""}
                    onChange={(e) => setAASFieldValue('id', e.target.value)}
                    className="h-9"
                    disabled={!editMode}
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('ID', aasConfig.id)} title="Copy ID">
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              {/* Asset Kind */}
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Asset Kind</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={aasConfig.assetKind || ""}
                    onChange={(e) => setAASFieldValue('assetKind', e.target.value)}
                    className="h-9"
                    disabled={!editMode}
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('Asset Kind', aasConfig.assetKind)} title="Copy Asset Kind">
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              {/* Global Asset ID */}
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Global Asset ID</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={aasConfig.globalAssetId || ""}
                    onChange={(e) => setAASFieldValue('globalAssetId', e.target.value)}
                    className="h-9"
                    disabled={!editMode}
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => copyText('Global Asset ID', aasConfig.globalAssetId)} title="Copy Global Asset ID">
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          {/* Actions */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-3">
               <Button
                 onClick={() => setEditMode((v) => !v)}
                 size="lg"
                 variant="default"
                 className={(editMode ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#61caf3] hover:bg-[#4db6e6]") + " text-white shadow-md"}
               >
                 {editMode ? "Done" : "Edit"}
               </Button>
               <Button
                 onClick={runInternalValidation}
                 size="lg"
                 variant="default"
                 className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
               >
                 Validate
               </Button>
               <Button
                onClick={openPdfDialog}
                size="lg"
                variant="outline"
                className="bg-white dark:bg-gray-900 border-gray-300 text-gray-800 hover:bg-gray-50 dark:text-gray-200 shadow-sm"
                disabled={downloadingPdfs}
                title="Download all PDFs in this model"
              >
                {downloadingPdfs ? (
                  <>
                    <div className="w-5 h-5 border-2 border-gray-600 dark:border-gray-300 border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2">Preparing PDFs...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-5 h-5" />
                    <span className="ml-2">Download PDFs</span>
                  </>
                )}
              </Button>
               {/* REMOVED: Save button per latest requirement */}
               <button
                 onClick={generateFinalAAS}
                 disabled={isGenerating || !canGenerate}
                 className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 {isGenerating ? (
                   <>
                     <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                     Exporting...
                   </>
                 ) : (
                   <>
                     <Download className="w-5 h-5" />
                     Export AAS
                   </>
                 )}
               </button>
            </div>
          </div>
        </div>
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

            {/* ADD: Validation Panels */}
            {(internalIssues.length > 0) && (
              <div className="mb-4">
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>Missing Required Fields ({internalIssues.length})</span>
                    </div>
                    <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-x border-b border-red-200 dark:border-red-700 rounded-b-lg p-3">
                    <ul className="list-disc list-inside text-sm space-y-2 text-red-800 dark:text-red-200">
                      {internalIssues.map((msg, idx) => (
                        <li key={idx} className="flex items-start justify-between gap-3">
                          <span className="break-words">{msg}</span>
                          <button
                            onClick={() => goToIssuePath(msg)}
                            className="shrink-0 px-2 py-1 text-xs bg-white dark:bg-gray-800 border border-red-300 dark:border-red-600 rounded hover:bg-red-100 dark:hover:bg-red-800/40"
                          >
                            Go to
                          </button>
                        </li>
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {(externalIssues.length > 0) && (
              <div className="mb-4">
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>XML Schema Errors ({xmlErrorsRaw.length || externalIssues.length})</span>
                    </div>
                    <ChevronDown className="w-4 h-4 transition-transform data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-x border-b border-yellow-200 dark:border-yellow-700 rounded-b-lg p-3">
                    {(() => {
                      const source = xmlErrorsRaw.length ? xmlErrorsRaw : externalIssues;
                      const friendly = buildFriendlyXmlErrors(source as any);
                      return (
                        <ul className="space-y-2 text-sm">
                          {friendly.map((fe, idx) => (
                            <li key={idx} className="flex items-start justify-between gap-3 p-2 rounded bg-white dark:bg-gray-800 border border-yellow-200 dark:border-yellow-700">
                              <div className="text-yellow-800 dark:text-yellow-200">
                                <div className="font-medium">{fe.message}</div>
                                {fe.hint && (
                                  <div className="text-xs text-yellow-700/80 dark:text-yellow-300/80 mt-0.5">
                                    {fe.hint}
                                  </div>
                                )}
                                {fe.path && (
                                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                    Path: {fe.path}
                                  </div>
                                )}
                              </div>
                              {fe.path ? (
                                <button
                                  onClick={() => goToIssuePath(fe.path!)}
                                  className="shrink-0 px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-yellow-300 dark:border-yellow-600 rounded hover:bg-yellow-100 dark:hover:bg-yellow-800/40"
                                >
                                  Go to
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )
                    })()}
                  </CollapsibleContent>
                </Collapsible>
                <AasEditorDebugXML xml={lastGeneratedXml} />
              </div>
            )}

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

        {/* Right Panel - Editable Fields (locked when Edit is off) */}
        <div className={`w-96 overflow-y-auto bg-gray-50 dark:bg-gray-800 ${editMode ? "" : "pointer-events-none opacity-70"}`}>
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

      {/* PDF Selection Dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={(open) => open ? setPdfDialogOpen(true) : closePdfDialog()}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Select PDFs to download</DialogTitle>
            <DialogDescription>
              Found {pdfEntries.length} PDF{pdfEntries.length > 1 ? "s" : ""}. Preview files and choose which to download.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={pdfSelected.size === pdfEntries.length && pdfEntries.length > 0}
                  onCheckedChange={(v) => toggleSelectAll(!!v)}
                />
                <span className="text-sm">Select all</span>
              </div>
              <div className="text-xs text-gray-500">
                Selected {pdfSelected.size}/{pdfEntries.length}
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {pdfEntries.map((e) => (
                <div key={e.name} className="flex items-center justify-between rounded border px-3 py-2 bg-white dark:bg-gray-900">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={pdfSelected.has(e.name)}
                      onCheckedChange={(v) => togglePdfSelection(e.name, !!v)}
                    />
                    <div>
                      <div className="text-sm font-medium">{e.name}</div>
                      <div className="text-xs text-gray-500">{Math.max(1, Math.round(e.bytes.length / 1024))} KB</div>
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(e.url, "_blank")}
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    title="Open preview"
                  >
                    <Eye className="w-4 h-4" />
                    <span className="text-sm">Preview</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePdfDialog}>Cancel</Button>
            <Button onClick={downloadSelectedPdfs} className="bg-[#61caf3] hover:bg-[#4db6e6] text-white">
              <FileDown className="w-4 h-4 mr-2" />
              Download selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Result Dialog */}
      <Dialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Validation Result</DialogTitle>
            <DialogDescription>
              Summary of checks for required fields, JSON structure, and XML schema compliance.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center mb-3">
            {validationDialogStatus === 'valid' ? (
              <div className="flex items-center gap-2 rounded-full bg-green-50 border border-green-300 px-3 py-1.5 shadow-sm">
                <CheckCircle className="w-6 h-6 text-green-700" />
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">IDTA</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-red-50 border border-red-300 px-3 py-1.5 shadow-sm">
                <AlertCircle className="w-6 h-6 text-red-700" />
                <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Invalid</span>
              </div>
            )}
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-300 text-center mb-2">
            {validationDialogStatus === 'valid'
              ? 'All checks passed.'
              : `Found ${validationCounts.internal + validationCounts.json + validationCounts.xml} issue(s).`}
          </div>

          {validationDialogStatus === 'invalid' && (
            <div className="space-y-4">
              {/* Summary list */}
              <div className="text-sm text-gray-600 dark:text-gray-300">
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Required fields/type: {validationCounts.internal}</li>
                  <li>JSON validation: {validationCounts.json}</li>
                  <li>XML schema: {validationCounts.xml}</li>
                </ul>

                <div className="mt-3">
                  {(() => {
                    const path = firstFixPath();
                    if (!path) return null;

                    return (
                      <button
                        onClick={() => {
                          setValidationDialogOpen(false);
                          goToIssuePath(path);
                        }}
                        className="inline-flex items-center px-2.5 py-1.5 rounded border text-xs bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Fix next
                      </button>
                    );
                  })()}
                </div>

                <div className="mt-2 text-xs text-gray-500">
                  Click "Go to" to jump directly to a field. Open the panels below for the full list.
                </div>
              </div>

              {/* Fields to fill now (actionable internal issues) */}
              {internalIssues.length > 0 && (
                <div className="mt-4 border rounded-md p-3 bg-white dark:bg-gray-900 border-red-200 dark:border-red-700">
                  <div className="text-xs font-semibold mb-2 text-gray-800 dark:text-gray-200">
                    Fields to fill now
                  </div>
                  <ul className="space-y-2">
                    {internalIssues.slice(0, 8).map((msg, idx) => (
                      <li key={idx} className="flex items-start justify-between gap-3">
                        <div className="text-sm text-gray-900 dark:text-gray-100">{msg}</div>
                        <button
                          onClick={() => {
                            setValidationDialogOpen(false);
                            goToIssuePath(msg);
                          }}
                          className="shrink-0 px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          Go to
                        </button>
                      </li>
                    ))}
                  </ul>
                  {internalIssues.length > 8 && (
                    <div className="mt-2 text-xs text-gray-500">
                      And more… see the Missing Required Fields panel below.
                    </div>
                  )}
                </div>
              )}

              {/* Top issues (friendly XML errors) */}
              {(() => {
                const source = xmlErrorsRaw.length ? xmlErrorsRaw : externalIssues;
                const friendlyRaw = buildFriendlyXmlErrors(source as any);
                const missingRefPaths = findReferenceElementsMissingKeys();
                let refIdx = 0;
                const enriched = friendlyRaw.map((fe) => {
                  if (!fe.path && fe.message.startsWith('A Reference lacks required key entries') && refIdx < missingRefPaths.length) {
                    const withPath = { ...fe, path: missingRefPaths[refIdx] };
                    refIdx += 1;
                    return withPath;
                  }
                  return fe;
                });
                const friendly = enriched.slice(0, 8);
                if (friendly.length === 0) return null;

                return (
                  <div className="mt-4 border rounded-md p-3 bg-white dark:bg-gray-900 border-yellow-200 dark:border-yellow-700">
                    <div className="text-xs font-semibold mb-2 text-gray-800 dark:text-gray-200">
                      Top issues
                    </div>
                    <ul className="space-y-3">
                      {friendly.map((fe, idx) => (
                        <li key={idx} className="flex items-start justify-between gap-3">
                          <div className="text-sm">
                            <div className="font-medium text-gray-900 dark:text-gray-100">{fe.message}</div>
                            {fe.hint && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{fe.hint}</div>
                            )}
                            {fe.path && (
                              <div className="text-[11px] text-gray-500 mt-0.5">Path: {fe.path}</div>
                            )}
                          </div>
                          {fe.path ? (
                            <button
                              onClick={() => {
                                setValidationDialogOpen(false);
                                goToIssuePath(fe.path!);
                              }}
                              className="shrink-0 px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              Go to
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {enriched.length > 8 && (
                      <div className="mt-2 text-xs text-gray-500">
                        And more… see the XML Schema Errors panel below.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Display name is missing a language entry */}
              <div className="border rounded-md p-3 bg-white dark:bg-gray-900">
                <div className="text-sm font-semibold mb-2">Display name is missing a language entry</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  This concerns the Submodel/Shell displayName. Add a language-tagged entry (e.g., en: "Nameplate") in your source model. Our generated XML omits displayName to avoid this error.
                </div>
              </div>

              {/* Value list has no entries */}
              <div className="border rounded-md p-3 bg-white dark:bg-gray-900">
                <div className="text-sm font-semibold mb-2">Value list has no entries</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  If using IEC 61360 valueList/valueReferencePairs, add at least one valueReferencePair or remove an empty valueList to comply with the schema.
                </div>
              </div>
            </div>
          )}

          <DialogFooter />
        </DialogContent>
      </Dialog>

      {/* Popup: No PDFs found */}
      <AlertDialog open={noPdfsDialogOpen} onOpenChange={setNoPdfsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No PDFs found</AlertDialogTitle>
            <AlertDialogDescription>
              This model does not contain any File elements with PDF content to download.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}