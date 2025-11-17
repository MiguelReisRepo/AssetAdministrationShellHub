// AASX XML Parser v2.0 - Complete rewrite
// Cache buster: 20250113-001

export interface AASXElement {
  idShort: string
  modelType: string
  value?: any // Make value optional, as collections/lists use children
  description?: string
  semanticId?: string
  valueType?: string
  contentType?: string
  children?: AASXElement[] // Explicitly for collections/lists
  preferredName?: Record<string, string>
  shortName?: Record<string, string>
  dataType?: string
  unit?: string
  sourceOfDefinition?: string
  category?: string
}

export interface AASXSubmodel {
  idShort: string
  id: string
  submodelElements: AASXElement[]
}

export interface AASXData {
  idShort: string
  submodels: AASXSubmodel[]
}

function getTextContent(element: Element, tagName: string): string {
  const el = element.querySelector(tagName)
  return el?.textContent?.trim() || ""
}

function parseElement(element: Element): AASXElement | null {
  console.log("[v0] PARSER V2: START Processing element. OuterHTML:", element.outerHTML);

  const idShort = getTextContent(element, "idShort")
  if (!idShort) {
    console.log("[v0] PARSER V2: No idShort found, skipping")
    return null
  }

  // Convert tagName to PascalCase to match the expected modelType format
  const rawModelType = element.tagName
  const modelType = rawModelType.charAt(0).toUpperCase() + rawModelType.slice(1)
  console.log(`[v0] PARSER V2: Element ${idShort} type: ${modelType} (from ${rawModelType})`)

  const parsed: AASXElement = {
    idShort,
    modelType,
  }

  const dataSpec = element.querySelector("embeddedDataSpecifications embeddedDataSpecification dataSpecificationContent")
  if (dataSpec) {
    console.log(`[v0] PARSER V2: Found embeddedDataSpecifications for ${idShort}`)
    
    // Preferred Name
    const prefNameEls = dataSpec.querySelectorAll("preferredName langStringTextType")
    if (prefNameEls.length > 0) {
      const prefName: Record<string, string> = {}
      prefNameEls.forEach(el => {
        const lang = getTextContent(el, "language")
        const text = getTextContent(el, "text")
        if (lang) prefName[lang] = text
      })
      parsed.preferredName = prefName
      console.log(`[v0] PARSER V2: Extracted preferredName for ${idShort}:`, prefName)
    }
    
    // Short Name
    const shortNameEls = dataSpec.querySelectorAll("shortName langStringTextType")
    if (shortNameEls.length > 0) {
      const shortName: Record<string, string> = {}
      shortNameEls.forEach(el => {
        const lang = getTextContent(el, "language")
        const text = getTextContent(el, "text")
        if (lang) shortName[lang] = text
      })
      parsed.shortName = shortName
      console.log(`[v0] PARSER V2: Extracted shortName for ${idShort}:`, shortName)
    }
    
    // Data Type
    const dataType = getTextContent(dataSpec, "dataType")
    if (dataType) {
      parsed.dataType = dataType
      console.log(`[v0] PARSER V2: Extracted dataType for ${idShort}:`, dataType)
    }
    
    // Unit
    const unit = getTextContent(dataSpec, "unit")
    if (unit) {
      parsed.unit = unit
      console.log(`[v0] PARSER V2: Extracted unit for ${idShort}:`, unit)
    }
    
    // Definition (as description)
    const defEls = dataSpec.querySelectorAll("definition langStringTextType")
    if (defEls.length > 0) {
      const enDef = Array.from(defEls).find(el => getTextContent(el, "language") === "en")
      if (enDef) {
        parsed.description = getTextContent(enDef, "text")
      } else {
        parsed.description = getTextContent(defEls[0], "text")
      }
      console.log(`[v0] PARSER V2: Extracted description for ${idShort}:`, parsed.description)
    }
    
    // Source of Definition
    const sourceDef = getTextContent(dataSpec, "sourceOfDefinition")
    if (sourceDef) {
      parsed.sourceOfDefinition = sourceDef
      console.log(`[v0] PARSER V2: Extracted sourceOfDefinition for ${idShort}:`, sourceDef)
    }
    
    console.log(`[v0] PARSER V2: Complete metadata for ${idShort}:`, {
      preferredName: parsed.preferredName,
      shortName: parsed.shortName,
      dataType: parsed.dataType,
      unit: parsed.unit,
      description: parsed.description,
      sourceOfDefinition: parsed.sourceOfDefinition
    })
  } else {
    console.log(`[v0] PARSER V2: No embeddedDataSpecifications found for ${idShort}`)
  }

  // Category
  const category = getTextContent(element, "category")
  if (category) {
    parsed.category = category
    console.log(`[v0] PARSER V2: Extracted category for ${idShort}:`, category)
  }

  // Extract semantic ID - Corrected to target the 'value' within 'keys'
  const semanticIdValueEl = element.querySelector("semanticId keys key value")
  if (semanticIdValueEl) {
    parsed.semanticId = semanticIdValueEl.textContent?.trim() || ""
    console.log(`[v0] PARSER V2: Extracted semanticId for ${idShort}: ${parsed.semanticId}`)
  } else {
    console.log(`[v0] PARSER V2: No semanticId found for ${idShort}`)
  }

  // Handle different element types
  if (modelType === "Property") {
    console.log(`[v0] PARSER V2: Processing Property element: ${element.outerHTML}`); // NEW LOG
    parsed.valueType = getTextContent(element, "valueType")
    
    // CRITICAL FIX: Ensure we get the direct child <value> of the property element
    const directValueElement = Array.from(element.children).find(child => child.tagName === "value");
    const extractedValue = directValueElement ? directValueElement.textContent?.trim() || "" : "";
    parsed.value = extractedValue;

    console.log(`[v0] PARSER V2: Property ${idShort} - Raw direct <value> element content: '${directValueElement?.textContent}'`); // NEW LOG
    console.log(`[v0] PARSER V2: Property ${idShort} - Extracted Value: '${extractedValue}' (valueType: ${parsed.valueType})`);
    console.log(`[v0] PARSER V2: Property ${idShort} - Extracted SemanticId: '${parsed.semanticId}'`);
  } else if (modelType === "MultiLanguageProperty") {
    // CRITICAL FIX: Target langStringTextType specifically within the 'value' tag
    const langStrings = element.querySelectorAll("value langStringTextType")
    const values: { language: string; text: string }[] = [];
    langStrings.forEach((ls) => {
      const lang = getTextContent(ls, "language")
      const text = getTextContent(ls, "text")
      if (lang && text) {
        values.push({ language: lang, text })
      }
    })
    parsed.value = values;
    console.log(`[v0] PARSER V2: MultiLangProperty ${idShort} - Extracted Values Array:`, values);
  } else if (modelType === "File") {
    parsed.contentType = getTextContent(element, "contentType")
    parsed.value = getTextContent(element, "value")
    console.log(`[v0] PARSER V2: File ${idShort} = '${parsed.value}' (contentType: ${parsed.contentType})`)
  } else if (modelType === "SubmodelElementCollection" || modelType === "SubmodelElementList") {
    console.log(`[v0] PARSER V2: Processing collection/list: ${idShort}`)
    console.log(`[v0] PARSER V2: Outer HTML for ${idShort}:`, element.outerHTML)

    const valueContainer = element.querySelector("value")
    if (valueContainer) {
      console.log(`[v0] PARSER V2: Found <value> container for ${idShort}. Outer HTML:`, valueContainer.outerHTML)
      const childrenElements = Array.from(valueContainer.children)
      console.log(`[v0] PARSER V2: <value> container has ${childrenElements.length} direct children. Tags:`, childrenElements.map(c => c.tagName))

      const parsedChildren: AASXElement[] = []
      childrenElements.forEach((childEl, index) => {
        console.log(`[v0] PARSER V2: Parsing child ${index + 1}/${childrenElements.length} tag: ${childEl.tagName} for ${idShort}`)
        const parsedChild = parseElement(childEl)
        if (parsedChild) {
          parsedChildren.push(parsedChild)
          console.log(`[v0] PARSER V2: Successfully parsed child: ${parsedChild.idShort} for ${idShort}`)
        } else {
          console.log(`[v0] PARSER V2: Failed to parse child element: ${childEl.tagName} for ${idShort}`)
        }
      })

      parsed.children = parsedChildren
      console.log(`[v0] PARSER V2: Collection ${idShort} has ${parsedChildren.length} parsed children.`)
    } else {
      console.log(`[v0] PARSER V2: WARNING - No <value> container found for collection/list ${idShort}. Assuming no children or non-standard structure.`)
      parsed.children = []
    }
    delete parsed.value; // Collections/lists don't have a direct 'value' property
  } else if (modelType === "BasicEventElement") {
    parsed.value = "Event" // Placeholder value for event elements
    console.log(`[v0] PARSER V2: BasicEventElement ${idShort} = '${parsed.value}'`)
  }

  // FINAL LOG for parsed element
  console.log(`[v0] PARSER V2: FINAL PARSED OBJECT for ${idShort}:`, JSON.stringify({
    idShort: parsed.idShort,
    modelType: parsed.modelType,
    value: parsed.value,
    semanticId: parsed.semanticId,
    childrenCount: parsed.children?.length || 0,
    valueType: parsed.valueType,
    preferredName: parsed.preferredName,
    shortName: parsed.shortName,
    description: parsed.description,
  }, null, 2));

  return parsed
}

export function parseAASXML(xmlString: string): AASXData | null {
  console.log("[v0] PARSER V2: Starting XML parse")
  console.log("[v0] PARSER V2: XML length:", xmlString.length)

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, "text/xml")

  const rootElement = doc.documentElement.tagName
  console.log("[v0] PARSER V2: Root element:", rootElement)

  if (rootElement === "html" || rootElement === "parsererror") {
    console.error("[v0] PARSER V2: Invalid XML")
    return null
  }

  // Find Asset Administration Shells
  const aasElements = doc.querySelectorAll("assetAdministrationShells > assetAdministrationShell")
  console.log(`[v0] PARSER V2: Found ${aasElements.length} AAS`)

  const firstAAS = aasElements[0]
  if (!firstAAS) {
    console.error("[v0] PARSER V2: No AAS found")
    return null
  }

  const aasIdShort = getTextContent(firstAAS, "idShort") || "Unknown"
  console.log("[v0] PARSER V2: AAS idShort:", aasIdShort)

  // Find submodels
  const submodelElements = doc.querySelectorAll("submodels > submodel")
  console.log(`[v0] PARSER V2: Found ${submodelElements.length} submodels`)

  const submodels: AASXSubmodel[] = []

  submodelElements.forEach((submodelEl, smIndex) => {
    const smIdShort = getTextContent(submodelEl, "idShort")
    const smId = getTextContent(submodelEl, "id")
    console.log(`[v0] PARSER V2: Processing submodel ${smIndex + 1}: ${smIdShort}`)

    const submodelElements: AASXElement[] = []
    const elementsContainer = submodelEl.querySelector("submodelElements")

    if (elementsContainer) {
      const elements = Array.from(elementsContainer.children)
      console.log(`[v0] PARSER V2: Submodel ${smIdShort} has ${elements.length} elements`)

      elements.forEach((el, elIndex) => {
        console.log(`[v0] PARSER V2: Parsing element ${elIndex + 1}/${elements.length}`)
        const parsed = parseElement(el)
        if (parsed) {
          submodelElements.push(parsed)
        }
      })
    }

    submodels.push({
      idShort: smIdShort,
      id: smId,
      submodelElements,
    })

    console.log(`[v0] PARSER V2: Submodel ${smIdShort} has ${submodelElements.length} parsed elements`)
  })

  console.log(`[v0] PARSER V2: Parsing complete - ${submodels.length} submodels`)
  return {
    idShort: aasIdShort,
    submodels,
  }
}