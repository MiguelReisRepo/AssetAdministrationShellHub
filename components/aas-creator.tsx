"use client"

import { useState, useEffect } from "react"
import { Download, Plus, Trash2, FileText, Loader2 } from 'lucide-react'

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

export function AASCreator({ onProceedToEditor }: { onProceedToEditor: (config: any) => void }) {
  const [templates, setTemplates] = useState<SubmodelTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSubmodels, setSelectedSubmodels] = useState<SelectedSubmodel[]>([])
  const [aasIdShort, setAasIdShort] = useState("MyAssetAdministrationShell")
  const [aasId, setAasId] = useState("https://example.com/aas/1")
  const [assetKind, setAssetKind] = useState<"Instance" | "Type">("Instance") // New state for Asset Kind
  const [globalAssetId, setGlobalAssetId] = useState("https://example.com/asset/1") // New state for Global Asset ID
  const [searchQuery, setSearchQuery] = useState("")

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

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Create Asset Administration Shell
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Build a new AAS by selecting submodel templates from IDTA specifications
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel: Your AAS */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Your AAS
            </h3>
            
            {/* AAS Configuration */}
            <div className="mb-6 space-y-4">
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

            {/* Selected Submodels */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Selected Submodels ({selectedSubmodels.length})
              </h4>
              {selectedSubmodels.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No submodels selected yet</p>
                  <p className="text-sm">Add submodels from the left panel</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedSubmodels.map((sm, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                    >
                      <input
                        type="text"
                        value={sm.idShort}
                        onChange={(e) => updateSubmodelIdShort(index, e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm"
                      />
                      <button
                        onClick={() => removeSubmodel(index)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={generateAAS}
              disabled={selectedSubmodels.length === 0}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                selectedSubmodels.length > 0
                  ? "bg-green-600 text-white hover:bg-green-700 shadow-md"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              <Download className="w-5 h-5" />
              Generate & Proceed to Editor
            </button>
          </div>

          {/* Right Panel: Available Submodel Templates */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Available Submodel Templates
            </h3>
            
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search submodels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No templates found matching "{searchQuery}"
              </div>
            ) : (
              <div className="space-y-3">
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
        </div>
      </div>
    </div>
  )
}