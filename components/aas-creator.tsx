"use client"

import { useState, useEffect } from "react"
import { Download, Plus, Trash2, FileText, Loader2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

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

export function AASCreator({ onProceedToEditor, onClose }: { onProceedToEditor: (config: any) => void, onClose?: () => void }) {
  const [templates, setTemplates] = useState<SubmodelTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSubmodels, setSelectedSubmodels] = useState<SelectedSubmodel[]>([])
  const [aasIdShort, setAasIdShort] = useState("MyAssetAdministrationShell")
  const [aasId, setAasId] = useState("https://example.com/aas/1")
  const [assetKind, setAssetKind] = useState<"Instance" | "Type">("Instance") // New state for Asset Kind
  const [globalAssetId, setGlobalAssetId] = useState("https://example.com/asset/1") // New state for Global Asset ID
  const [searchQuery, setSearchQuery] = useState("")
  const [step, setStep] = useState<1 | 2>(1)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    fetchSubmodelTemplates()
  }, [])

  const fetchSubmodelTemplates = async () => {
    try {
      setLoading(true)
      // Fetch the list of published submodel templates from IDTA GitHub
      console.log("[v0] Fetching submodel templates from GitHub API...")
      
      const response = await fetch(
        "https://api.github.com/repos/admin-shell-io/submodel-templates/contents/published"
      )
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = await response.json()
      console.log("[v0] GitHub API returned", data.length, "items")

      // Filter for directories only (submodel templates)
      const templateDirs = data.filter((item: any) => item.type === "dir")
      console.log("[v0] Found", templateDirs.length, "template directories")
      
      // Map to template objects
      const fetchedTemplates: SubmodelTemplate[] = templateDirs.map((dir: any) => {
        // Clean up the name for display
        const cleanName = dir.name
          .replace(/_/g, " ")
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .trim()
        
        return {
          name: cleanName,
          version: "1.0", // Default version, could be extracted from subdirectories
          description: `IDTA submodel template for ${cleanName}`,
          url: `https://github.com/admin-shell-io/submodel-templates/tree/main/published/${dir.name}`
        }
      })
      
      console.log("[v0] Loaded", fetchedTemplates.length, "templates")
      setTemplates(fetchedTemplates)
      
    } catch (error) {
      console.error("[v0] Error fetching submodel templates:", error)
      // Fallback to mock templates if API fails
      const mockTemplates: SubmodelTemplate[] = [
        {
          name: "ContactInformation",
          version: "1.0",
          description: "Contact information for the asset",
          url: "https://github.com/admin-shell-io/submodel-templates/tree/main/published/Contact_Information"
        },
        {
          name: "DigitalNameplate",
          version: "2.0",
          description: "Digital nameplate information",
          url: "https://github.com/admin-shell-io/submodel-templates/tree/main/published/Digital_Nameplate"
        },
        {
          name: "TechnicalData",
          version: "1.2",
          description: "Technical specifications and data",
          url: "https://github.com/admin-shell-io/submodel-templates/tree/main/published/Technical_Data"
        },
        {
          name: "Handover Documentation",
          version: "1.1",
          description: "Documentation for asset handover",
          url: "https://github.com/admin-shell-io/submodel-templates/tree/main/published/Handover_Documentation"
        },
        {
          name: "Carbon Footprint",
          version: "1.0",
          description: "Product carbon footprint information",
          url: "https://github.com/admin-shell-io/submodel-templates/tree/main/published/Carbon_Footprint"
        }
      ]
      
      setTemplates(mockTemplates)
    } finally {
      setLoading(false)
    }
  }

  const addSubmodel = (template: SubmodelTemplate) => {
    const idShort = template.name.replace(/\s+/g, "")
    setSelectedSubmodels([...selectedSubmodels, { template, idShort }])
  }

  const removeSubmodel = (index: number) => {
    setSelectedSubmodels(selectedSubmodels.filter((_, i) => i !== index))
  }

  const updateSubmodelIdShort = (index: number, newIdShort: string) => {
    const updated = [...selectedSubmodels]
    updated[index].idShort = newIdShort
    setSelectedSubmodels(updated)
  }

  const generateAAS = () => {
    onProceedToEditor({
      idShort: aasIdShort,
      id: aasId,
      assetKind: assetKind, // Pass new assetKind
      globalAssetId: globalAssetId, // Pass new globalAssetId
      selectedSubmodels: selectedSubmodels,
    })
  }

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isStep1Valid =
    aasIdShort.trim().length > 0 &&
    aasId.trim().length > 0 &&
    assetKind.trim().length > 0 &&
    globalAssetId.trim().length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) onClose?.()
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Asset Administration Shell</DialogTitle>
          <DialogDescription>
            Fill your AAS details, then pick submodel templates.
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Your AAS
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    AAS IdShort
                  </label>
                  <input
                    type="text"
                    value={aasIdShort}
                    onChange={(e) => setAasIdShort(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    placeholder="MyAssetAdministrationShell"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    AAS ID
                  </label>
                  <input
                    type="text"
                    value={aasId}
                    onChange={(e) => setAasId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    placeholder="https://example.com/aas/1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Asset Kind
                  </label>
                  <select
                    value={assetKind}
                    onChange={(e) => setAssetKind(e.target.value as "Instance" | "Type")}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  >
                    <option value="Instance">Instance</option>
                    <option value="Type">Type</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Global Asset ID
                  </label>
                  <input
                    type="text"
                    value={globalAssetId}
                    onChange={(e) => setGlobalAssetId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    placeholder="https://example.com/asset/1"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Available Submodel Templates
              </h3>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Selected: {selectedSubmodels.length}
              </span>
            </div>
            {selectedSubmodels.length > 0 && (
              <div className="-mt-1">
                <div className="flex flex-wrap gap-2">
                  {selectedSubmodels.map((sm, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 px-2.5 py-1 text-xs text-gray-800 dark:text-gray-200"
                      title={sm.template.name}
                    >
                      {sm.idShort || sm.template.name}
                      <button
                        type="button"
                        aria-label={`Remove ${sm.idShort || sm.template.name}`}
                        onClick={() => removeSubmodel(index)}
                        className="ml-1 rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-gray-800"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <input
                type="text"
                placeholder="Search submodels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No templates found matching "{searchQuery}"
              </div>
            ) : (
              <div className="space-y-3 max-h-[50vh] overflow-auto pr-1">
                {filteredTemplates.map((template, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-400 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {template.name}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Version {template.version}
                        </p>
                      </div>
                      <button
                        onClick={() => addSubmodel(template)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {template.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-4">
          {step === 2 ? (
            <div className="flex w-full items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                Back
              </button>
              <button
                onClick={generateAAS}
                disabled={selectedSubmodels.length === 0}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition ${
                  selectedSubmodels.length > 0
                    ? "bg-green-600 text-white hover:bg-green-700 shadow"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                <Download className="w-5 h-5" />
                Generate & Proceed to Editor
              </button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!isStep1Valid}
                className={`px-6 py-2 rounded-lg font-medium transition ${
                  isStep1Valid
                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                Next
              </button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}