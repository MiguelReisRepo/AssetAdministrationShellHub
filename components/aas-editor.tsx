"use client"

import { useState, useEffect, useRef } from "react"
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
  const [validationDialogDismissed, setValidationDialogDismissed] = useState(false)
  // Add UI state for fixing/validation busy (near other useState declarations)
  const [isFixing, setIsFixing] = useState(false);
  const [validationBusy, setValidationBusy] = useState(false);

  // Add a reentrancy guard ref if not present already
  const validationRunningRef = useRef(false);

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
      const att = attachmentsState || attachments
      if (!att) return null
      let candidate = raw.trim()
      if (!candidate) return null
      const decoded = tryDecodeBase64(candidate)
      if (decoded) candidate = decoded.trim()
      if (/^data:/i.test(candidate)) {
        if (/^data:application\/pdf/i.test(candidate)) {
          return { name: "document.pdf", bytes: dataUrlToUint8(candidate) }
        }
        return null
      }
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
        `aasx/Document/${basename}`,
        `/aasx/Document/${basename}`,
      ]
      let foundKey: string | undefined
      for (const key of searchKeys) {
        if (att[key]) { foundKey = key; break }
      }
      if (!foundKey) {
        const kv = Object.entries(att).find(([k]) => {
          const lk = k.toLowerCase()
          const bb = basename.toLowerCase()
          return lk.endsWith(`/${bb}`) || lk === bb
        })
        if (kv) foundKey = kv[0]
      }
      if (!foundKey) return null
      const dataUrl = att[foundKey]
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

    // ... existing helper defs ...

    // NEW helpers for asset information normalization and derivation
    const normalizeAssetKind = (ak?: string) => {
      const v = String(ak || "").trim();
      return ["Instance", "Type", "Role", "NotApplicable"].includes(v) ? v : "Instance";
    };
    const findPropertyValue = (ids: string[]): string | undefined => {
      const wanted = new Set(ids.map((s) => s.toLowerCase()));
      for (const sm of aasConfig.selectedSubmodels) {
        const els = submodelData[sm.idShort] || [];
        const walk = (list: SubmodelElement[]): string | undefined => {
          for (const el of list) {
            if (el.modelType === "Property" && wanted.has(String(el.idShort || "").toLowerCase())) {
              const val = typeof el.value === "string" ? el.value.trim() : "";
              if (val) return val;
            }
            if (Array.isArray(el.children) && el.children.length) {
              const got = walk(el.children);
              if (got) return got;
            }
          }
          return undefined;
        };
        const r = walk(els);
        if (r) return r;
      }
      return undefined;
    };
    const deriveGlobalAssetIdValue = (): string => {
      const cfg = String(aasConfig.globalAssetId || "").trim();
      if (cfg) return cfg;
      const fromAssetId = findPropertyValue(["AssetId", "AssetID"]);
      if (fromAssetId) return fromAssetId;
      return "urn:placeholder";
    };
    const deriveManufacturerPartId = (): string | undefined => {
      return (
        findPropertyValue(["MAN_PROD_NUM", "ManufacturerPartNumber"]) ||
        undefined
      );
    };

    // ... existing code that collects concepts ...

    let defaultThumbnailXml = '';
    if (thumbnail) {
      // ... existing thumbnail code ...
    }

    // NEW: prebuild assetInformation fragments
    const assetKindXmlVal = normalizeAssetKind(aasConfig.assetKind);
    const gaiVal = deriveGlobalAssetIdValue();
    const globalAssetIdXml = `        <globalAssetId>
          <type>ExternalReference</type>
          <keys>
            <key>
              <type>AssetGlobalIdentifier</type>
              <value>${escapeXml(gaiVal)}</value>
            </key>
          </keys>
        </globalAssetId>
`;
    const mpn = deriveManufacturerPartId();
    const specificAssetIdsXml = mpn
      ? `        <specificAssetIds>
          <specificAssetId>
            <name>manufacturerPartId</name>
            <value>${escapeXml(mpn)}</value>
          </specificAssetId>
        </specificAssetIds>
`
      : "";

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
        <assetKind>${assetKindXmlVal}</assetKind>
${globalAssetIdXml}${specificAssetIdsXml}${defaultThumbnailXml.trimEnd()}
      </assetInformation>
      <submodels>
${submodelRefs}
      </submodels>
    </assetAdministrationShell>
  </assetAdministrationShells>
  <submodels>
${submodelsXml}
  </submodels>
${conceptXml && conceptXml.trim().length > 0 ? `  <conceptDescriptions>
${conceptXml}
  </conceptDescriptions>
` : ""}</environment>`;
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
  // UPDATED: sanitize idShorts when creating JSON, so export always passes validation
  function buildJsonEnvironment() {
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

    const mapElementToJson = (element: any): any => {
      const base: any = {
        idShort: sanitizeIdShortJson(element.idShort),
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
          return {
            ...base,
            value: element.value
          };
        default:
          return base;
      }
    };

    const jsonSubmodels = aasConfig.selectedSubmodels.map(sm => {
      const elements = submodelData[sm.idShort] || [];
      const smIdShortSan = sanitizeIdShortJson(sm.idShort);
      return {
        idShort: smIdShortSan,
        id: `${aasConfig.id}/submodels/${smIdShortSan}`,
        kind: "Instance",
        semanticId: {
          keys: [{
            type: "GlobalReference",
            value: sm.template.url || `https://admin-shell.io/submodels/${smIdShortSan}`
          }]
        },
        submodelElements: elements.map(mapElementToJson),
      };
    });

    const shellIdShortSan = sanitizeIdShortJson(aasConfig.idShort || "");
    const jsonShell = {
      id: aasConfig.id,
      idShort: shellIdShortSan,
      assetInformation: {
        assetKind: aasConfig.assetKind,
        globalAssetId: {
          type: "ExternalReference",
          keys: [{ type: "AssetGlobalIdentifier", value: aasConfig.globalAssetId || sanitizeIdShortJson(aasConfig.idShort || "") }],
        },
        ...(aasConfig.selectedSubmodels.length > 0 ? { specificAssetIds: [] } : {}),
      },
      submodels: jsonSubmodels.map(sm => ({
        keys: [
          {
            type: "Submodel",
            value: sm.id
          }
        ]
      }))
    };

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
              idShort: sanitizeIdShortJson(el.idShort),
              embeddedDataSpecifications: [
                {
                  dataSpecification: {
                    keys: [
                      { type: "GlobalReference", value: "https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360" }
                    ]
                  },
                  dataSpecificationContent: {
                    dataSpecificationIec61360: {
                      preferredName: preferredName ? Object.entries(preferredName).map(([language, text]) => ({ language, text })) : [{ language: "en", text: sanitizeIdShortJson(el.idShort) }],
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

  // Generate XML for a SubmodelElement (AAS 3.1)
  function generateElementXml(element: SubmodelElement, indent: string = "      "): string {
    const typeKey = String(element.modelType || "Property").toLowerCase();
    const tagName =
      typeKey === "property" ? "property" :
      typeKey === "multilanguageproperty" ? "multiLanguageProperty" :
      typeKey === "submodelelementcollection" ? "submodelElementCollection" :
      typeKey === "submodelelementlist" ? "submodelElementList" :
      typeKey === "file" ? "file" :
      typeKey === "referenceelement" ? "referenceElement" :
      "property";

    const isReference = tagName === "referenceElement";

    let xml = `${indent}<${tagName}>\n`;

    // Optional category
    if (element.category && String(element.category).trim() !== "") {
      xml += `${indent}  <category>${escapeXml(element.category)}</category>\n`;
    }

    // idShort
    xml += `${indent}  <idShort>${escapeXml(element.idShort)}</idShort>\n`;

    // Optional description (langStringTextType) when non-empty
    if (element.description && String(element.description).trim() !== "") {
      const desc = typeof element.description === "string" ? element.description : String(element.description);
      xml += `${indent}  <description>\n`;
      xml += `${indent}    <langStringTextType>\n`;
      xml += `${indent}      <language>en</language>\n`;
      xml += `${indent}      <text>${escapeXml(desc)}</text>\n`;
      xml += `${indent}    </langStringTextType>\n`;
      xml += `${indent}  </description>\n`;
    }

    // Type-specific content
    if (tagName === "property") {
      const vt = normalizeValueType(element.valueType) || deriveValueTypeFromIEC(element.dataType) || "xs:string";
      xml += `${indent}  <valueType>${escapeXml(vt)}</valueType>\n`;
      const valStr = typeof element.value === "string" ? element.value.trim() : "";
      if (valStr) {
        xml += `${indent}  <value>${escapeXml(valStr)}</value>\n`;
      } else {
        xml += `${indent}  <value/>\n`;
      }
    } else if (tagName === "multiLanguageProperty") {
      const entries = (element.value && typeof element.value === "object")
        ? Object.entries(element.value as Record<string, string>).filter(([, t]) => t && String(t).trim() !== "")
        : [];
      if (entries.length > 0) {
        xml += `${indent}  <value>\n`;
        for (const [lang, text] of entries) {
          xml += `${indent}    <langStringTextType>\n`;
          xml += `${indent}      <language>${escapeXml(lang)}</language>\n`;
          xml += `${indent}      <text>${escapeXml(text)}</text>\n`;
          xml += `${indent}    </langStringTextType>\n`;
        }
        xml += `${indent}  </value>\n`;
      } else {
        xml += `${indent}  <value/>\n`;
      }
    } else if (tagName === "file") {
      const contentType = (element.fileData?.mimeType || "application/octet-stream").trim();
      xml += `${indent}  <contentType>${escapeXml(contentType)}</contentType>\n`;
      const valStr = typeof element.value === "string" ? element.value.trim() : "";
      if (valStr) {
        xml += `${indent}  <value>${escapeXml(valStr)}</value>\n`;
      } else {
        xml += `${indent}  <value/>\n`;
      }
    } else if (tagName === "submodelElementCollection" || tagName === "submodelElementList") {
      const kids = Array.isArray(element.children) ? element.children : [];
      if (kids.length > 0) {
        xml += `${indent}  <value>\n`;
        for (const child of kids) {
          xml += generateElementXml(child, indent + "    ");
        }
        xml += `${indent}  </value>\n`;
      }
    } else if (tagName === "referenceElement") {
      // ReferenceElement must contain valueId (Reference). No <value>, no IEC61360.
      const v: any = element.value;
      const hasKeys = v && typeof v === "object" && Array.isArray(v.keys) && v.keys.length > 0;
      const fallback = (typeof v === "string" ? v.trim() : "") || (element.semanticId || "").trim();
      xml += `${indent}  <valueId>\n`;
      xml += `${indent}    <type>ExternalReference</type>\n`;
      xml += `${indent}    <keys>\n`;
      if (hasKeys) {
        for (const k of v.keys as any[]) {
          xml += `${indent}      <key>\n`;
          xml += `${indent}        <type>${escapeXml(k.type || "GlobalReference")}</type>\n`;
          xml += `${indent}        <value>${escapeXml(k.value || "")}</value>\n`;
          xml += `${indent}      </key>\n`;
        }
      } else if (fallback) {
        xml += `${indent}      <key>\n`;
        xml += `${indent}        <type>GlobalReference</type>\n`;
        xml += `${indent}        <value>${escapeXml(fallback)}</value>\n`;
        xml += `${indent}      </key>\n`;
      }
      xml += `${indent}    </keys>\n`;
      xml += `${indent}  </valueId>\n`;
    }

    // semanticId (skip for ReferenceElement)
    if (element.semanticId && !isReference) {
      const sem = String(element.semanticId).trim();
      if (sem) {
        xml += `${indent}  <semanticId>\n`;
        xml += `${indent}    <type>ExternalReference</type>\n`;
        xml += `${indent}    <keys>\n`;
        xml += `${indent}      <key>\n`;
        xml += `${indent}        <type>GlobalReference</type>\n`;
        xml += `${indent}        <value>${escapeXml(sem)}</value>\n`;
        xml += `${indent}      </key>\n`;
        xml += `${indent}    </keys>\n`;
        xml += `${indent}  </semanticId>\n`;
      }
    }

    // embeddedDataSpecifications (IEC 61360) — only when actual meta exists and NOT for ReferenceElement
    if (!isReference) {
      const hasPref = (() => {
        if (!element.preferredName) return false;
        if (typeof element.preferredName === "string") return element.preferredName.trim() !== "";
        return Object.values(element.preferredName).some((t) => t && String(t).trim() !== "");
      })();
      const hasShort = (() => {
        if (!element.shortName) return false;
        if (typeof element.shortName === "string") return element.shortName.trim() !== "";
        return Object.values(element.shortName).some((t) => t && String(t).trim() !== "");
      })();
      const hasUnit = !!(element.unit && element.unit.trim() !== "");
      const hasDt = !!(element.dataType && element.dataType.trim() !== "");
      const hasDef = !!(element.description && String(element.description).trim() !== "");

      if (hasPref || hasShort || hasUnit || hasDt || hasDef) {
        const prefObj = typeof element.preferredName === "string" ? { en: element.preferredName } : (element.preferredName || {});
        const shortObj = typeof element.shortName === "string" ? { en: element.shortName } : (element.shortName || {});

        // preferredName entries (fallback to idShort if none)
        const preferredNameEntries = Object.entries(prefObj as Record<string, string>)
          .filter(([, t]) => t && String(t).trim() !== "");
        const preferredXml = preferredNameEntries.length > 0
          ? preferredNameEntries.map(([lang, text]) =>
              `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>${escapeXml(lang)}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringPreferredNameTypeIec61360>\n`
            ).join("")
          : `${indent}            <langStringPreferredNameTypeIec61360>
${indent}              <language>en</language>
${indent}              <text>${escapeXml(element.idShort)}</text>
${indent}            </langStringPreferredNameTypeIec61360>\n`;

        const shortNameEntries = Object.entries(shortObj as Record<string, string>)
          .filter(([, t]) => t && String(t).trim() !== "");
        const shortXml = shortNameEntries.map(([lang, text]) =>
          `${indent}            <langStringShortNameTypeIec61360>
${indent}              <language>${escapeXml(lang)}</language>
${indent}              <text>${escapeXml(text)}</text>
${indent}            </langStringShortNameTypeIec61360>\n`
        ).join("");

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
        xml += preferredXml;
        xml += `${indent}          </preferredName>\n`;
        if (shortXml) {
          xml += `${indent}          <shortName>\n`;
          xml += shortXml;
          xml += `${indent}          </shortName>\n`;
        }
        if (hasUnit) {
          xml += `${indent}          <unit>${escapeXml(element.unit!)}</unit>\n`;
        }
        if (hasDt) {
          xml += `${indent}          <dataType>${escapeXml(element.dataType!)}</dataType>\n`;
        }
        if (hasDef) {
          const d = typeof element.description === "string" ? element.description : String(element.description);
          xml += `${indent}          <definition>\n`;
          xml += `${indent}            <langStringDefinitionTypeIec61360>\n`;
          xml += `${indent}              <language>en</language>\n`;
          xml += `${indent}              <text>${escapeXml(d)}</text>\n`;
          xml += `${indent}            </langStringDefinitionTypeIec61360>\n`;
          xml += `${indent}          </definition>\n`;
        }
        xml += `${indent}        </dataSpecificationIec61360>\n`;
        xml += `${indent}      </dataSpecificationContent>\n`;
        xml += `${indent}    </embeddedDataSpecification>\n`;
        xml += `${indent}  </embeddedDataSpecifications>\n`;
      }
    }

    xml += `${indent}</${tagName}>\n`;
    return xml;
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
      // NEW: Only reuse original XML if it's already AAS 3.x; upgrade legacy 1.0/3.0 on export
      const isLegacy10 = !!originalXml && (/http:\/\/www\.admin-shell\.io\/aas\/1\/0/i.test(originalXml) || /<aas:aasenv/i.test(originalXml));
      const is3xXml = !!originalXml && /https:\/\/admin-shell\.io\/aas\/3\/[01]/i.test(originalXml);
      const preferOriginalXml = hasValidated && !!originalXml && originalXml.trim().length > 0 && is3xXml;

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
          elements.forEach((element) => {
            if (element.modelType === "File" && element.fileData) {
              const base64Data = element.fileData.content.split(",")[1];
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
        aasConfig.selectedSubmodels.forEach((sm) => {
          addFilesFromElements(submodelData[sm.idShort] || []);
        });

        // Add thumbnail (if present) to the root
        if (thumbnail) {
          const mimeTypeMatch = thumbnail.match(/^data:(image\/(png|jpeg|gif|svg\+xml));base64,/);
          if (mimeTypeMatch) {
            const mime = mimeTypeMatch[1];
            const ext = mimeTypeMatch[2] === "svg+xml" ? "svg" : mimeTypeMatch[2];
            const thumbName = `thumbnail.${ext}`;
            const base64Data = thumbnail.split(",")[1];
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
        zip.file(
          "aasx/aasx-origin",
          `<?xml version="1.0" encoding="UTF-8"?>
<origin xmlns="http://admin-shell.io/aasx/relationships/aasx-origin">
  <originPath>/${xmlFileName}</originPath>
</origin>`
        );
        zip.file(
          "_rels/.rels",
          `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="aasx-origin" Type="http://admin-shell.io/aasx/relationships/aasx-origin" Target="/aasx/aasx-origin"/>
</Relationships>`
        );
        const relId = "R" + Math.random().toString(16).slice(2);
        zip.file(
          "_rels/aasx-original.rels",
          `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/${xmlFileName}" Id="${relId}" /></Relationships>`
        );
        zip.file(
          "[Content_Types].xml",
          `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml" /><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="png" ContentType="image/png" /><Default Extension="pdf" ContentType="application/pdf" /><Default Extension="json" ContentType="text/plain" /><Override PartName="/aasx/aasx-origin" ContentType="text/plain" /></Types>`
        );

        const blob = await zip.generateAsync({ type: "blob" });

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

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${aasConfig.idShort}.aasx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success("AASX exported using your original 3.x XML.");
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

      // REPLACED: Build the final XML using the shared builder to ensure a correct 3.1 structure
      const aasXml = buildCurrentXml();

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
            globalAssetId: {
              type: "ExternalReference",
              keys: [{ type: "AssetGlobalIdentifier", value: aasConfig.globalAssetId || sanitizeIdShortJson(aasConfig.idShort || "") }],
            },
            ...(aasConfig.selectedSubmodels.length > 0 ? { specificAssetIds: [] } : {}),
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
  const runInternalValidation = async (overrideXml?: string, options?: { openDialog?: boolean }) => {
    if (validationRunningRef.current) return;
    validationRunningRef.current = true;
    setValidationBusy(true);
    try {
      // Our internal required-fields/type checks
      const internal = validateAAS();
      setInternalIssues(internal.missingFields);

      // Build JSON for structural validation
      const env = buildJsonEnvironment();
      const jsonResult = await validateAASXJson(JSON.stringify(env));

      // Prefer original uploaded XML if available
      const xmlBuilt =
        (overrideXml && overrideXml.trim().length > 0)
          ? overrideXml
          : (originalXml && originalXml.trim().length > 0)
            ? originalXml
            : buildCurrentXml();
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

      // Detect service outage and notify via toast
      const serviceDown = Array.isArray(rawErrors) && rawErrors.some((e: any) => {
        const msg = typeof e === "string" ? e : (e?.message || "");
        return /validation service unavailable|validation service timeout|failed to fetch/i.test(msg);
      });
      if (serviceDown) {
        toast.warning("XML validation service is unavailable. Skipping XML check; you can still proceed.");
      }

      const allGood = internalCount === 0 && jsonResult.valid && (serviceDown ? true : xmlResult.valid);

      // Open validation result popup (respect options and dismissal)
      const wantOpen = options?.openDialog ?? validationDialogOpen;
      const shouldOpen = wantOpen && !validationDialogDismissed;
      setValidationDialogOpen(shouldOpen);

      setValidationCounts({ internal: internalCount, json: jsonErrCount, xml: xmlErrCount });
      setValidationDialogStatus(allGood ? 'valid' : 'invalid');
      setCanGenerate(allGood);

      setHasValidated(true);

      if (allGood && onSave) {
        const resultToSave: ValidationResult = {
          file: `${aasConfig.idShort}.aasx`,
          type: "AASX",
          valid: true,
          processingTime: 0,
          parsed: xmlResult.parsed,
          aasData: xmlResult.aasData,
          originalXml: xmlBuilt, // fixed XML bytes
          thumbnail: initialThumbnail || undefined,
          attachments: attachmentsState || attachments,
        };
        onSave(resultToSave);
        toast.success("Model fixed and saved; it will show as valid on Home and export with the corrected XML.");
      }

      // Auto-fix if all good
      if (allGood && xmlResult.valid && !serviceDown) {
        fixXmlErrors();
      }
    } finally {
      validationRunningRef.current = false;
      setValidationBusy(false);
    }
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
  type FriendlyXmlError = { message: string; hint?: string; path?: string; field?: string; displayField?: string; line?: number };

  function buildFriendlyXmlErrors(errs: (string | { message?: string; loc?: { lineNumber?: number } })[]): FriendlyXmlError[] {
    return (errs || []).map((raw) => {
      const text = typeof raw === "string" ? raw : (raw?.message ? String(raw.message) : String(raw));
      const lower = text.toLowerCase();

      let msg = text;
      let hint: string | undefined;
      let path: string | undefined;
      let field: string | undefined;
      let displayField: string | undefined;
      const line = typeof raw === "object" ? (raw?.loc?.lineNumber ?? undefined) : undefined;

      // Try to resolve exact path by line number against the last generated XML
      if (line && lastGeneratedXml) {
        const resolved = resolvePathFromLine(lastGeneratedXml, line);
        path = resolved || undefined;

        // If index-based resolution failed, fall back to heuristic scanners
        if (!path) {
          const ctx = getContextFromXml(lastGeneratedXml, line);
          path = ctx.path || guessPathFromXmlLine(lastGeneratedXml, line) || undefined;
        }

        msg = `${msg} (Line ${line})`;
      }

      // Derive the field name from the message and build a display field "<path> > <field>"
      field = getFieldFromMessage(text);
      if (field) {
        displayField = path ? `${path} > ${field}` : field;
      }

      // Contextual hints
      if (lower.includes("minlength") && lower.includes("{https://admin-shell.io/aas/3/1}value")) {
        hint = "Provide a non-empty value or remove the empty <value/> for required elements.";
      } else if (lower.includes("displayname") && lower.includes("langStringNameType")) {
        hint = "Add a language-tagged displayName entry (e.g., langStringNameType with language=en).";
      } else if (lower.includes("description") && lower.includes("langStringTextType")) {
        hint = "Descriptions must include langStringTextType; add language and text.";
      } else if (lower.includes("embeddeddataspecifications") && lower.includes("embeddeddataspecification")) {
        hint = "If embeddedDataSpecifications is present, it must contain at least one embeddedDataSpecification.";
      } else if (lower.includes("definition") && lower.includes("langStringDefinitionTypeIec61360")) {
        hint = "IEC61360 definition must include langStringDefinitionTypeIec61360 with language and text.";
      } else if (lower.includes("valuereferencepairs") && lower.includes("valueReferencePair".toLowerCase())) {
        hint = "Value list must include at least one valueReferencePair entry or remove the empty list.";
      } else if (lower.includes("valuetype") || lower.includes("sequence")) {
        hint = "Ensure valueType appears before value for Property / MultiLanguageProperty.";
      } else if (lower.includes("contenttype") && lower.includes("file")) {
        hint = "File elements must include contentType and a valid value (path or URL).";
      } else if (lower.includes("semanticid")) {
        hint = "Use ExternalReference with keys → GlobalReference → value containing the semantic ID.";
      }

      return { message: msg, hint, path, field, displayField, line };
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
      const submodelRegex = /<submodel>[\s\S]*?<\/submodel>/g;
      const conceptRegex = /<conceptDescription>[\s\S]*?<\/conceptDescription>/g;

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

  // Helper: map error message to field name
  function getFieldFromMessage(text: string): string | undefined {
    const lower = text.toLowerCase();
    if (lower.includes("{https://admin-shell.io/aas/3/1}value")) return "value";
    if (lower.includes("displayname")) return "displayName";
    if (lower.includes("{https://admin-shell.io/aas/3/1}description") || lower.includes("langstringtexttype")) return "description";
    if (lower.includes("embeddeddataspecifications")) return "embeddedDataSpecifications";
    if (lower.includes("{https://admin-shell.io/aas/3/1}definition") || lower.includes("langstringdefinitiontypeiec61360")) return "definition";
    if (lower.includes("{https://admin-shell.io/aas/3/1}valuereferencepairs") || lower.includes("valuereferencepair")) return "valueReferencePairs";
    return undefined;
  }

  // Helper: get submodel idShort and nearest element idShort before a given line
  function getContextFromXml(xml: string, lineNumber: number): { submodel?: string; element?: string; path?: string } {
    try {
      const lines = xml.split(/\r?\n/);
      const idx = Math.max(0, Math.min(lines.length - 1, (lineNumber || 1) - 1));
      const upTo = lines.slice(0, idx + 1).join("\n");

      // Find the last submodel idShort before this line
      let submodel: string | undefined;
      const submodelRegex = /<submodel>[\s\S]*?<\/submodel>/gi;
      let smMatch: RegExpExecArray | null;
      while ((smMatch = submodelRegex.exec(upTo))) {
        submodel = (smMatch[1] || "").trim();
      }

      // Find the nearest element idShort before this line (avoid catching the submodel idShort if possible)
      let element: string | undefined;
      // Look for a block with one of the known element tags containing an idShort
      const elementBlockRegex = /<(property|multiLanguageProperty|file|submodelElementCollection|submodelElementList|referenceElement|blob|range|basicEventElement|operation|entity|capability)[^>]*>[\s\S]*?<idShort>([^<]+)<\/idShort>[\s\S]*?<\/\1>/gi;
      let elBlock: RegExpExecArray | null;
      let lastElBlock: string | undefined;
      while ((elBlock = elementBlockRegex.exec(upTo))) {
        lastElBlock = elBlock[2];
      }
      if (lastElBlock) {
        const idMatch = /<idShort>([^<]+)<\/idShort>/i.exec(lastElBlock);
        if (idMatch) element = (idMatch[1] || "").trim();
      } else {
        // Fallback: last idShort anywhere before this line
        let idShortMatch: RegExpExecArray | null;
        const idShortRegex = /<idShort>([^<]+)<\/idShort>/gi;
        let lastId: string | undefined;
        while ((idShortMatch = idShortRegex.exec(upTo))) {
          lastId = (idShortMatch[1] || "").trim();
        }
        // Avoid submodel idShort if it equals
        element = lastId && lastId !== submodel ? lastId : undefined;
      }

      const path = submodel && element ? `${submodel} > ${element}` : (element || submodel);
      return { submodel, element, path };
    } catch {
      return {};
    }
  }

  // NEW: Robust XML indexer to locate Submodel and element blocks with positions
  type XmlBlock = { type: string; idShort: string; start: number; end: number; parent?: string };
  let xmlIndexCache: { xml?: string; submodels: XmlBlock[]; elements: XmlBlock[]; concepts: XmlBlock[] } | null = null;

  function buildXmlIndex(xml: string) {
    if (xmlIndexCache?.xml === xml) return xmlIndexCache;

    const submodels: XmlBlock[] = [];
    const elements: XmlBlock[] = [];
    const concepts: XmlBlock[] = [];

    // Index submodels
    {
      const re = /<submodel>[\s\S]*?<\/submodel>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml))) {
        const block = m[0];
        const start = m.index;
        const end = m.index + block.length;
        const idMatch = /<idShort>([^<]+)<\/idShort>/i.exec(block);
        const idShort = (idMatch?.[1] || "Submodel").trim();
        submodels.push({ type: "submodel", idShort, start, end });
      }
    }

    // Index conceptDescriptions
    {
      const re = /<conceptDescription>[\s\S]*?<\/conceptDescription>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml))) {
        const block = m[0];
        const start = m.index;
        const end = m.index + block.length;
        const idMatch = /<idShort>([^<]+)<\/idShort>/i.exec(block);
        const idShort = (idMatch?.[1] || "Concept").trim();
        concepts.push({ type: "conceptDescription", idShort, start, end });
      }
    }

    // Index elements and attach parent submodel by containment
    {
      const re = /<(property|multiLanguageProperty|file|submodelElementCollection|submodelElementList|referenceElement|blob|range|basicEventElement|operation|entity|capability)[^>]*>[\s\S]*?<idShort>([^<]+)<\/idShort>[\s\S]*?<\/\1>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml))) {
        const type = m[1];
        const idShort = (m[2] || "Element").trim();
        const block = m[0];
        const start = m.index;
        const end = m.index + block.length;

        // Find parent submodel containing this element
        let parent: string | undefined;
        for (const sm of submodels) {
          if (sm.start <= start && end <= sm.end) {
            parent = sm.idShort;
            break;
          }
        }
        elements.push({ type, idShort, start, end, parent });
      }
    }

    xmlIndexCache = { xml, submodels, elements, concepts };
    return xmlIndexCache;
  }

  // NEW: Resolve exact path from a validator line using the index
  function resolvePathFromLine(xml: string, lineNumber: number): string | null {
    try {
      if (!lineNumber || lineNumber < 1) return null;
      const lines = xml.split(/\r?\n/);
      const offset = lines.slice(0, Math.min(lines.length, lineNumber - 1)).reduce((acc, ln) => acc + ln.length + 1, 0); // +1 for newline
      const idx = buildXmlIndex(xml);

      // Prefer element containment
      const el = idx.elements.find(b => b.start <= offset && offset <= b.end);
      if (el && el.parent) return `${el.parent} > ${el.idShort}`;
      if (el) return el.idShort;

      // Otherwise check submodel containment
      const sm = idx.submodels.find(b => b.start <= offset && offset <= b.end);
      if (sm) return sm.idShort;

      // Or conceptDescription containment
      const cd = idx.concepts.find(b => b.start <= offset && offset <= b.end);
      if (cd) return `Concept > ${cd.idShort}`;

      return null;
    } catch {
      return null;
    }
  }

  // NEW: Auto-fix XML errors in original XML (or current XML preview) by adding/removing minimal content to satisfy schema
  function fixXmlErrors(): string | null {
    // Use original uploaded XML if present; else fall back to latest built XML
    const xml =
      (originalXml && originalXml.trim()) ||
      (lastGeneratedXml && lastGeneratedXml.trim()) ||
      buildCurrentXml();

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      toast.error("Unable to parse XML to apply fixes.");
      return null;
    }

    const ns = doc.documentElement.namespaceURI || "https://admin-shell.io/aas/3/1";
    const create = (local: string) => doc.createElementNS(ns, local);

    // Helper: find nearest idShort text for a friendly default
    const findNearestIdShort = (el: Element): string | null => {
      let cur: Element | null = el;
      while (cur) {
        const idShortChild = Array.from(cur.children).find((c) => c.localName === "idShort");
        if (idShortChild && idShortChild.textContent && idShortChild.textContent.trim()) {
          return idShortChild.textContent.trim();
        }
        cur = cur.parentElement;
      }
      return null;
    };

    // Helper: determine if a node is under dataSpecificationIec61360
    const isUnderIec61360 = (el: Element): boolean => {
      let cur: Element | null = el.parentElement;
      while (cur) {
        if (cur.localName === "dataSpecificationIec61360") return true;
        cur = cur.parentElement;
      }
      return false;
    };

    // Helper: get global asset ID from XML
    const getGlobalAssetId = (): string | null => {
      const gai = doc.getElementsByTagName("globalAssetId")[0];
      const txt = gai?.textContent?.trim();
      return txt && txt.length > 0 ? txt : null;
    };

    // Helper: sanitize idShort to match pattern
    const idShortRe = /^[A-Za-z][A-Za-z0-9_-]*[A-Za-z0-9_]$/;
    const sanitizeIdShort = (val: string): string => {
      let s = (val || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
      // ensure starts with a letter
      if (!/^[A-Za-z]/.test(s)) s = "X" + s.replace(/^[^A-Za-z]+/, "");
      // ensure doesn't end with hyphen
      s = s.replace(/-+$/, "");
      // fallback if becomes empty
      if (!s) s = "X1";
      // if still invalid, force safe ending
      if (!idShortRe.test(s)) {
        if (!/[A-Za-z0-9_]$/.test(s)) s = s + "1";
        if (!idShortRe.test(s)) s = "X1";
      }
      return s;
    };

    // Pass 1: fix empty texts and required child blocks
    const all = Array.from(doc.getElementsByTagName("*"));
    all.forEach((el) => {
      const ln = el.localName;

      // 1) Empty <value/>: choose placeholder based on context (kept)
      if (ln === "value" && el.children.length === 0 && (!el.textContent || el.textContent.trim() === "")) {
        const parent = el.parentElement;
        let placeholder = "—";
        if (parent?.localName === "file") {
          placeholder = "urn:placeholder";
        } else {
          const vtEl = parent?.getElementsByTagName("valueType")?.[0];
          const vtText = vtEl?.textContent?.trim()?.toLowerCase();
          if (vtText === "xs:anyuri") {
            placeholder = "urn:placeholder";
          }
        }
        el.textContent = placeholder;
      }

      // 2) displayName must have langStringNameType (kept)
      if (ln === "displayName" && el.children.length === 0) {
        const block = create("langStringNameType");
        const language = create("language");
        language.textContent = "en";
        const text = create("text");
        text.textContent = findNearestIdShort(el) || "Display Name";
        block.appendChild(language);
        block.appendChild(text);
        el.appendChild(block);
      }

      // 3) description must have langStringTextType (kept)
      if (ln === "description" && el.children.length === 0) {
        const block = create("langStringTextType");
        const language = create("language");
        language.textContent = "en";
        const text = create("text");
        text.textContent = "—";
        block.appendChild(language);
        block.appendChild(text);
        el.appendChild(block);
      }

      // 4) embeddedDataSpecifications empty -> remove (kept)
      if (ln === "embeddedDataSpecifications" && el.children.length === 0) {
        el.parentElement?.removeChild(el);
      }

      // 5) definition under IEC61360 must contain langStringDefinitionTypeIec61360 (kept)
      if (ln === "definition" && el.children.length === 0 && isUnderIec61360(el)) {
        const block = create("langStringDefinitionTypeIec61360");
        const language = create("language");
        language.textContent = "en";
        const text = create("text");
        text.textContent = "—";
        block.appendChild(language);
        block.appendChild(text);
        el.appendChild(block);
      }

      // 6) valueReferencePairs: if empty, remove its parent valueList (schema requires it)
      if (ln === "valueReferencePairs") {
        const hasChildPair = Array.from(el.children).some((c) => c.localName === "valueReferencePair");
        if (!hasChildPair) {
          const parent = el.parentElement;
          if (parent?.localName === "valueList") {
            parent.parentElement?.removeChild(parent);
          } else {
            el.parentElement?.removeChild(el);
          }
        }
      }

      // 7) valueList with no valueReferencePairs -> remove (kept)
      if (ln === "valueList") {
        const hasVrp = Array.from(el.children).some((c) => c.localName === "valueReferencePairs");
        if (!hasVrp) {
          el.parentElement?.removeChild(el);
        }
      }

      // 8) preferredName under IEC61360 must have langStringPreferredNameTypeIec61360
      if (ln === "preferredName" && el.children.length === 0 && isUnderIec61360(el)) {
        const block = create("langStringPreferredNameTypeIec61360");
        const language = create("language");
        language.textContent = "en";
        const text = create("text");
        text.textContent = findNearestIdShort(el) || "Name";
        block.appendChild(language);
        block.appendChild(text);
        el.appendChild(block);
      }

      // 9) keys must contain at least one key
      if (ln === "keys") {
        const hasKey = Array.from(el.children).some((c) => c.localName === "key");
        if (!hasKey) {
          const key = create("key");
          const typeEl = create("type");
          const valueEl = create("value");
          // Choose type based on context
          const parentName = el.parentElement?.localName;
          if (parentName === "semanticId" || parentName === "dataSpecification") {
            typeEl.textContent = "GlobalReference";
          } else if (parentName === "reference") {
            // If under submodels > reference, it's likely a Submodel reference
            typeEl.textContent = "Submodel";
          } else {
            typeEl.textContent = "GlobalReference";
          }
          valueEl.textContent = "urn:placeholder";
          key.appendChild(typeEl);
          key.appendChild(valueEl);
          el.appendChild(key);
        }
      }
    });

    // Pass 2: specificAssetIds must contain specificAssetId with name/value
    Array.from(doc.getElementsByTagName("specificAssetIds")).forEach((container) => {
      const hasSpecificAssetId = Array.from(container.children).some((c) => c.localName === "specificAssetId");
      if (!hasSpecificAssetId) {
        const sai = create("specificAssetId");
        const name = create("name");
        const value = create("value");
        const nearest = findNearestIdShort(container) || "asset";
        const gai = getGlobalAssetId() || nearest;
        name.textContent = nearest;
        value.textContent = gai;
        sai.appendChild(name);
        sai.appendChild(value);
        container.appendChild(sai);
      }
    });

    // Pass 3: assetType must be non-empty (schema minLength=1)
    Array.from(doc.getElementsByTagName("assetType")).forEach((el) => {
      const txt = el.textContent?.trim() || "";
      if (txt.length === 0) {
        el.textContent = "Product";
      }
    });

    // Pass 4: conceptDescriptions container — remove if empty
    Array.from(doc.getElementsByTagName("conceptDescriptions")).forEach((cds) => {
      const hasAny = Array.from(cds.children).some((c) => c.localName === "conceptDescription");
      if (!hasAny) {
        cds.parentElement?.removeChild(cds);
      }
    });

    // Pass 5: normalize all idShort values to match pattern
    Array.from(doc.getElementsByTagName("idShort")).forEach((idEl) => {
      const raw = idEl.textContent || "";
      const cleaned = sanitizeIdShort(raw);
      idEl.textContent = cleaned;
    });

    // Pass 6: Ensure embeddedDataSpecifications has a minimal valid child if present
    Array.from(doc.getElementsByTagName("embeddedDataSpecifications")).forEach((eds) => {
      const embedded = Array.from(eds.children).filter((c) => c.localName === "embeddedDataSpecification");
      // If container has other content but no embeddedDataSpecification, add one
      if (embedded.length === 0 && eds.children.length > 0) {
        const e = create("embeddedDataSpecification");
        eds.appendChild(e);
        embedded.push(e);
      } else if (embedded.length === 0 && eds.children.length === 0) {
        // already handled earlier (container removed), skip
        return;
      }
      embedded.forEach((e) => {
        let dataSpec = Array.from(e.children).find((c) => c.localName === "dataSpecification");
        if (!dataSpec) {
          dataSpec = create("dataSpecification");
          e.appendChild(dataSpec);
        }
        let keys = Array.from(dataSpec.children).find((c) => c.localName === "keys");
        if (!keys) {
          keys = create("keys");
          dataSpec.appendChild(keys);
        }
        // Ensure at least one key GlobalReference → IEC61360 template
        const hasKey = Array.from(keys.children).some((c) => c.localName === "key");
        if (!hasKey) {
          const key = create("key");
          const typeEl = create("type");
          const valueEl = create("value");
          typeEl.textContent = "GlobalReference";
          valueEl.textContent = "https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360";
          key.appendChild(typeEl);
          key.appendChild(valueEl);
          keys.appendChild(key);
        }

        let dsc = Array.from(e.children).find((c) => c.localName === "dataSpecificationContent");
        if (!dsc) {
          dsc = create("dataSpecificationContent");
          e.appendChild(dsc);
        }
        let iec = Array.from(dsc.children).find((c) => c.localName === "dataSpecificationIec61360");
        if (!iec) {
          iec = create("dataSpecificationIec61360");
          dsc.appendChild(iec);
        }
        // Ensure preferredName exists with at least one language entry
        let preferredName = Array.from(iec.children).find((c) => c.localName === "preferredName");
        if (!preferredName) {
          preferredName = create("preferredName");
          iec.appendChild(preferredName);
        }
        const hasLangPref = Array.from(preferredName.children).some((c) => c.localName === "langStringPreferredNameTypeIec61360");
        if (!hasLangPref) {
          const block = create("langStringPreferredNameTypeIec61360");
          const language = create("language");
          language.textContent = "en";
          const text = create("text");
          text.textContent = findNearestIdShort(e) || "Name";
          block.appendChild(language);
          block.appendChild(text);
          preferredName.appendChild(block);
        }
        // If shortName exists but empty, add language block
        let shortName = Array.from(iec.children).find((c) => c.localName === "shortName");
        if (shortName && shortName.children.length === 0) {
          const block = create("langStringShortNameTypeIec61360");
          const language = create("language");
          language.textContent = "en";
          const text = create("text");
          text.textContent = findNearestIdShort(e) || "Short";
          block.appendChild(language);
          block.appendChild(text);
          shortName.appendChild(block);
        }
        // If definition exists but empty, add language block (kept by earlier pass if under IEC61360)
        let definition = Array.from(iec.children).find((c) => c.localName === "definition");
        if (definition && definition.children.length === 0) {
          const block = create("langStringDefinitionTypeIec61360");
          const language = create("language");
          language.textContent = "en";
          const text = create("text");
          text.textContent = "—";
          block.appendChild(language);
          block.appendChild(text);
          definition.appendChild(block);
        }
      });
    });

    // Pass 7: remove empty Operation variable containers (they're optional but cannot be empty)
    ["inputVariables", "outputVariables", "inoutputVariables"].forEach((localName) => {
      Array.from(doc.getElementsByTagName(localName)).forEach((container) => {
        const hasOpVar = Array.from(container.children).some((c) => c.localName === "operationVariable");
        if (!hasOpVar) {
          container.parentElement?.removeChild(container);
        }
      });
    });

    // Pass 8: remove empty submodelElements containers (must contain at least one allowed element if present)
    Array.from(doc.getElementsByTagName("submodelElements")).forEach((container) => {
      const allowed = new Set([
        "relationshipElement",
        "annotatedRelationshipElement",
        "basicEventElement",
        "blob",
        "capability",
        "entity",
        "file",
        "multiLanguageProperty",
        "operation",
        "property",
        "range",
        "referenceElement",
        "submodelElementCollection",
        "submodelElementList"
      ]);
      const hasAny = Array.from(container.children).some((c) => allowed.has(c.localName));
      if (!hasAny) {
        container.parentElement?.removeChild(container);
      }
    });

    // Pass 9: sanitize all <language> values to valid BCP47 tags (fallback to 'en' if invalid)
    Array.from(doc.getElementsByTagName("language")).forEach((langEl) => {
      const raw = (langEl.textContent || "").trim();
      // Simple BCP47 check: starts with 2–8 letters and only allowed subtags
      const isValid = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})*$/.test(raw);
      if (!isValid || raw.length === 0) {
        langEl.textContent = "en";
      }
    });

    // Pass 10: ensure non-empty <text> in any langString* blocks
    Array.from(doc.getElementsByTagName("text")).forEach((textEl) => {
      const parent = textEl.parentElement;
      const isLangString = !!parent && parent.localName.toLowerCase().startsWith("langstring");
      const raw = (textEl.textContent || "").trim();
      if (isLangString && raw.length === 0) {
        textEl.textContent = "—";
      }
    });

    // Pass 11: remove defaultThumbnail if path is empty or missing (schema requires non-empty path)
    Array.from(doc.getElementsByTagName("defaultThumbnail")).forEach((thumbEl) => {
      const pathEl = Array.from(thumbEl.children).find((c) => c.localName === "path");
      const contentEl = Array.from(thumbEl.children).find((c) => c.localName === "contentType");
      const pathTxt = (pathEl?.textContent || "").trim();
      const contentTxt = (contentEl?.textContent || "").trim();
      if (!pathEl || pathTxt.length === 0 || (contentEl && contentTxt.length === 0)) {
        thumbEl.parentElement?.removeChild(thumbEl);
      }
    });

    // Pass 12: For each Property, ensure valueType exists and comes BEFORE any direct <value>; reorder if needed
    Array.from(doc.getElementsByTagName("property")).forEach((prop) => {
      const children = Array.from(prop.children);
      const vtEl = children.find((c) => c.localName === "valueType") as Element | undefined;
      const valueEls = children.filter((c) => c.localName === "value") as Element[];

      // If multiple <value> children, keep the first and remove the extras
      if (valueEls.length > 1) {
        for (let i = 1; i < valueEls.length; i++) {
          prop.removeChild(valueEls[i]);
        }
      }
      const firstValue = valueEls[0];

      // Build a valueType if missing, preferring IEC 61360 dataType, else xs:string
      const ensureValueType = (): Element => {
        // Try IEC 61360 dataType from embeddedDataSpecifications › dataSpecificationContent › dataSpecificationIec61360 › dataType
        let iecType = "";
        const eds = prop.getElementsByTagName("embeddedDataSpecifications")[0];
        if (eds) {
          const dsc = eds.getElementsByTagName("dataSpecificationContent")[0];
          if (dsc) {
            const iec = dsc.getElementsByTagName("dataSpecificationIec61360")[0];
            if (iec) {
              const dt = iec.getElementsByTagName("dataType")[0];
              iecType = dt?.textContent?.trim() || "";
            }
          }
        }
        const vtText = (typeof deriveValueTypeFromIEC === "function" ? (deriveValueTypeFromIEC(iecType) || "xs:string") : "xs:string");
        const el = create("valueType");
        el.textContent = vtText;
        // Insert before the first <value> (or append if no value)
        if (firstValue) {
          prop.insertBefore(el, firstValue);
        } else {
          prop.appendChild(el);
        }
        return el;
      };

      const vt = vtEl || ensureValueType();

      // Ensure order: valueType must be before value
      if (firstValue) {
        const vtIdx = children.indexOf(vt);
        const valIdx = children.indexOf(firstValue);
        if (valIdx !== -1 && vtIdx !== -1 && valIdx < vtIdx) {
          // move value to be right after valueType
          prop.removeChild(firstValue);
          prop.insertBefore(firstValue, vt.nextSibling);
        }
      }
    });

    // Pass 13: For each File, ensure contentType is a valid non-empty MIME (infer from value path or fallback)
    Array.from(doc.getElementsByTagName("file")).forEach((fileEl) => {
      const getChild = (name: string) => Array.from(fileEl.children).find((c) => c.localName === name) as Element | undefined;
      let ctEl = getChild("contentType");
      const valEl = getChild("value");
      const valPath = (valEl?.textContent || "").trim().toLowerCase();

      // Infer MIME from extension
      const ext = (() => {
        if (!valPath) return "";
        const parts = valPath.split("?")[0].split("#")[0].split(".");
        return parts.length > 1 ? parts.pop() || "" : "";
      })();
      const extToMime = (e: string): string | undefined => {
        switch (e) {
          case "png": return "image/png";
          case "jpg":
          case "jpeg": return "image/jpeg";
          case "gif": return "image/gif";
          case "svg": return "image/svg+xml";
          case "pdf": return "application/pdf";
          case "txt": return "text/plain";
          case "json": return "application/json";
          default: return undefined;
        }
      };
      const mimeFromExt = extToMime(ext);
      const isValidMime = (s: string) => /^[!#$%&'*+\-.\^_`|~0-9a-zA-Z]+\/[!#$%&'*+\-.\^_`|~0-9a-zA-Z]+(?:\s*;\s*[!#$%&'*+\-.\^_`|~0-9a-zA-Z]+=(?:[!#$%&'*+\-.\^_`|~0-9a-zA-Z]+|"[^"]*"))*$/.test(s);

      const chosen = mimeFromExt || "application/octet-stream";

      if (!ctEl) {
        ctEl = create("contentType");
        ctEl.textContent = chosen;
        // Insert contentType before value if possible to keep typical order
        if (valEl) fileEl.insertBefore(ctEl, valEl);
        else fileEl.appendChild(ctEl);
      } else {
        const raw = (ctEl.textContent || "").trim();
        if (raw.length === 0 || !isValidMime(raw)) {
          ctEl.textContent = chosen;
        }
      }
    });

    // Pass 14: Ensure valueFormat has non-empty text (schema minLength=1)
    Array.from(doc.getElementsByTagName("valueFormat")).forEach((vfEl) => {
      const txt = (vfEl.textContent || "").trim();
      if (txt.length === 0) {
        vfEl.textContent = "text/plain";
      }
    });

    const fixed = new XMLSerializer().serializeToString(doc);
    const withHeader = fixed.startsWith("<?xml") ? fixed : `<?xml version="1.0" encoding="UTF-8"?>\n${fixed}`;

    // Update editor state to use the fixed XML for next validation/export
    setOriginalXml(withHeader);
    setLastGeneratedXml(withHeader);

    // NEW: also fix model.json in attachments
    fixJsonEnvironment();

    toast.success("Applied fixes. Click Validate to re-check.");
    return withHeader;
  }

  // ADD: keep an editable attachments state so we can replace model.json
  const [attachmentsState, setAttachmentsState] = useState<Record<string, string> | undefined>(attachments);

  // Helper: base64 encode/decode for JSON data URLs
  function toBase64Utf8(str: string): string {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function fromBase64Utf8(b64: string): string {
    return decodeURIComponent(escape(atob(b64)));
  }
  function jsonToDataUrl(obj: any): string {
    const s = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    return "data:application/json;base64," + toBase64Utf8(s);
  }
  function dataUrlToString(dataUrl: string): string {
    const base64 = (dataUrl || "").split(",")[1] || "";
    return fromBase64Utf8(base64);
  }

  // NEW: build XML data URL from string
  function xmlToDataUrl(xml: string): string {
    return "data:text/xml;base64," + toBase64Utf8(xml);
  }

  // Reuse XML idShort sanitizer for JSON
  // UPDATED: align with json-validator.ts pattern (final char must be a letter or digit)
  const idShortPattern = /^[A-Za-z][A-Za-z0-9_-]*[A-Za-z0-9]$|^[A-Za-z]$/;
  function sanitizeIdShortJson(val: string): string {
    let s = (val || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
    // ensure starts with a letter
    if (!/^[A-Za-z]/.test(s)) s = "X" + s.replace(/^[^A-Za-z]+/, "");
    // remove trailing underscores/dashes
    s = s.replace(/[_-]+$/, "");
    // fallback if becomes empty
    if (!s) s = "X1";
    // enforce pattern; ensure final char is alphanumeric
    if (!idShortPattern.test(s)) {
      if (!/[A-Za-z0-9]$/.test(s)) s = s + "1";
      if (!idShortPattern.test(s)) s = "X1";
    }
    return s;
  }

  // Walk JSON object and sanitize idShorts; also fill assetType/specificAssetIds
  function fixJsonEnvironment() {
    try {
      const att = attachmentsState || attachments;
      if (!att) return;

      // Find a JSON entry; prefer model.json
      const jsonKey =
        Object.keys(att).find((k) => k.toLowerCase().endsWith("model.json")) ||
        Object.keys(att).find((k) => /\.json$/i.test(k));
      if (!jsonKey) return;

      const rawDataUrl = att[jsonKey];
      // still try to parse even if content-type is text/plain
      const jsonText = dataUrlToString(rawDataUrl);
      const env = JSON.parse(jsonText);

      // 1) Sanitize all idShort fields recursively
      const sanitizeAllIdShorts = (node: any) => {
        if (!node || typeof node !== "object") return;
        for (const [k, v] of Object.entries(node)) {
          if (k === "idShort" && typeof v === "string") {
            (node as any)[k] = sanitizeIdShortJson(v);
          } else if (Array.isArray(v)) {
            v.forEach(sanitizeAllIdShorts);
          } else if (v && typeof v === "object") {
            sanitizeAllIdShorts(v);
          }
        }
      };
      sanitizeAllIdShorts(env);

      // 2) Ensure assetType is non-empty and specificAssetIds has content
      const shells = Array.isArray(env.assetAdministrationShells) ? env.assetAdministrationShells : [];
      if (shells.length > 0) {
        const shell = shells[0];
        if (shell && shell.assetInformation) {
          const ai = shell.assetInformation;
          const atxt = (ai.assetType || "").trim();
          if (atxt.length === 0) {
            ai.assetType = "Product";
          }
          // specificAssetIds: array expected; if missing/empty, add one
          let sai = ai.specificAssetIds;
          if (!Array.isArray(sai)) {
            sai = [];
          }
          if (sai.length === 0) {
            ai.specificAssetIds = [
              {
                name: sanitizeIdShortJson(shell.idShort || "asset"),
                value: ai.globalAssetId || sanitizeIdShortJson(shell.idShort || "asset"),
              },
            ];
          } else {
            ai.specificAssetIds = sai;
          }
        }
      }

      // Build updated data URL and store in attachments state
      const fixedDataUrl = jsonToDataUrl(env);
      const next = { ...(attachmentsState || attachments) };
      next[jsonKey] = fixedDataUrl;
      setAttachmentsState(next);
    } catch (err) {
      console.warn("[v0] Fix JSON failed:", err);
    }
  }

  // NEW: find an attachment key by filename (case-insensitive)
  function findAttachmentKeyByBasename(att: Record<string, string> | undefined, nameCandidates: string[]): string | undefined {
    if (!att) return undefined;
    const keys = Object.keys(att);
    const lcCandidates = nameCandidates.map((n) => n.toLowerCase());
    for (const key of keys) {
      const base = key.split("/").pop() || key;
      const lcBase = base.toLowerCase();
      if (lcCandidates.includes(lcBase)) return key;
    }
    // fallback: check exact endsWith snippet
    for (const key of keys) {
      const lcKey = key.toLowerCase();
      for (const cand of lcCandidates) {
        if (lcKey.endsWith("/" + cand) || lcKey.endsWith(cand)) return key;
      }
    }
    return undefined;
  }

  // ADD: click handler for the Fix button that fixes then validates once
  const handleFixClick = async () => {
    if (isFixing || validationBusy) return;
    setIsFixing(true);
    console.log("[v0] Fix button clicked");
    try {
      const fixedXml = fixXmlErrors();
      await runInternalValidation(fixedXml || undefined, { openDialog: true });
    } finally {
      setIsFixing(false);
    }
  };

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
                 onClick={() => {
                   setValidationDialogDismissed(false);
                   runInternalValidation(undefined, { openDialog: true });
                 }}
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
                                {fe.field && (
                                  <div className="text-xs text-yellow-700/80 dark:text-yellow-300/80 mt-0.5">
                                    Field: {fe.displayField ?? fe.field}
                                  </div>
                                )}
                                {fe.hint && (
                                  <div className="text-xs text-yellow-700/80 dark:text-yellow-300/80 mt-0.5">
                                    {fe.hint}
                                  </div>
                                )}
                                {fe.path && (
                                  <div className="text-[11px] text-gray-500 mt-0.5">
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
      <Dialog
        open={validationDialogOpen}
        onOpenChange={(open) => {
          setValidationDialogOpen(open);
          if (!open) setValidationDialogDismissed(true); // mark as dismissed only when closing
        }}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Validation Result</DialogTitle>
            <DialogDescription>
              Summary of checks for required fields, JSON structure, and XML schema compliance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-center">
            <div className="text-lg font-semibold">
              {validationDialogStatus === 'valid' ? 'Valid' : 'Invalid'}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Found {validationCounts.internal + validationCounts.json + validationCounts.xml} issue(s).
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              <ul className="list-none space-y-1">
                <li>Required fields/type: {validationCounts.internal}</li>
                <li>JSON validation: {validationCounts.json}</li>
                <li>XML schema: {validationCounts.xml}</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleFixClick}
              disabled={isFixing || validationBusy}
              className="bg-[#61caf3] hover:bg-[#4db6e6] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFixing ? "Fixing..." : "Fix Errors"}
            </Button>
          </DialogFooter>
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