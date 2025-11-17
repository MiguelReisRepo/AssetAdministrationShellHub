async function testXMLParser() {
  console.log("[TEST] Starting XML parser test")

  // Sample XML from the user's files
  const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<environment xmlns="https://admin-shell.io/aas/3/0">
  <assetAdministrationShells>
    <assetAdministrationShell>
      <idShort>TestAAS</idShort>
      <id>http://example.com/aas/test</id>
    </assetAdministrationShell>
  </assetAdministrationShells>
  <submodels>
    <submodel>
      <idShort>Nameplate</idShort>
      <id>http://example.com/sm/0</id>
      <submodelElements>
        <property>
          <idShort>ManufacturerName</idShort>
          <valueType>xs:string</valueType>
          <value>ACME Corp</value>
        </property>
        <submodelElementCollection>
          <idShort>Address</idShort>
          <value>
            <property>
              <idShort>Street</idShort>
              <valueType>xs:string</valueType>
              <value>123 Main St</value>
            </property>
            <property>
              <idShort>City</idShort>
              <valueType>xs:string</valueType>
              <value>Springfield</value>
            </property>
          </value>
        </submodelElementCollection>
      </submodelElements>
    </submodel>
  </submodels>
</environment>`

  console.log("[TEST] Parsing XML...")

  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(sampleXML, "text/xml")

  console.log("[TEST] XML Doc root:", xmlDoc.documentElement.tagName)

  const submodels = Array.from(xmlDoc.querySelectorAll("submodel"))
  console.log("[TEST] Found submodels:", submodels.length)

  submodels.forEach((sm, idx) => {
    const idShort = sm.querySelector("idShort")?.textContent
    console.log(`[TEST] Submodel ${idx}: ${idShort}`)

    const submodelElements = sm.querySelector("submodelElements")
    if (submodelElements) {
      const children = Array.from(submodelElements.children)
      console.log(`[TEST]   Found ${children.length} top-level elements`)

      children.forEach((child, childIdx) => {
        const childIdShort = child.querySelector("idShort")?.textContent
        const childType = child.tagName
        console.log(`[TEST]     Element ${childIdx}: ${childIdShort} (${childType})`)

        if (childType === "submodelElementCollection") {
          const valueContainer = child.querySelector("value")
          if (valueContainer) {
            const nestedChildren = Array.from(valueContainer.children)
            console.log(`[TEST]       Found value container with ${nestedChildren.length} nested children`)
            nestedChildren.forEach((nested, nestedIdx) => {
              const nestedIdShort = nested.querySelector("idShort")?.textContent
              const nestedType = nested.tagName
              const nestedValue = nested.querySelector("value")?.textContent
              console.log(`[TEST]         Nested ${nestedIdx}: ${nestedIdShort} (${nestedType}) = ${nestedValue}`)
            })
          } else {
            console.log(`[TEST]       NO value container found!`)
          }
        }
      })
    }
  })

  console.log("[TEST] Parser test complete")
}

testXMLParser().catch(console.error)
