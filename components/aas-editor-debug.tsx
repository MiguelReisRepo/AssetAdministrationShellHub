"use client";

import React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Copy } from "lucide-react";

type Props = {
  xml: string | null;
};

function copyToClipboard(text: string) {
  if (!text) return;
  void navigator.clipboard.writeText(text);
}

function analyzeXml(xml: string) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    // If parsererror, just return it
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      return {
        ok: false,
        message: "XML parsing error in preview",
        offending: [] as string[],
      };
    }

    const props = Array.from(doc.getElementsByTagName("property"));
    const offending: string[] = [];

    props.forEach((prop) => {
      // Collect only direct child order of this <property>
      const children = Array.from(prop.children);
      const order = children.map((c) => c.tagName); // local names without NS prefix (DOM strips it here)
      // Find first direct <valueType> and <value> among direct children
      const valueTypeIdx = order.findIndex((n) => n === "valueType");
      const valueIdx = order.findIndex((n) => n === "value");

      // Extract idShort (direct child)
      const idShortEl = children.find((c) => c.tagName === "idShort");
      const idShort = idShortEl?.textContent?.trim() || "(unknown property)";

      // Flag if <value> exists before <valueType> OR <valueType> missing
      if ((valueIdx >= 0 && (valueTypeIdx < 0 || valueIdx < valueTypeIdx)) || valueTypeIdx < 0) {
        offending.push(idShort);
      }
    });

    return {
      ok: true,
      offending,
    };
  } catch {
    return {
      ok: false,
      message: "Failed to analyze XML",
      offending: [] as string[],
    };
  }
}

export default function AasEditorDebugXML({ xml }: Props) {
  if (!xml) return null;

  const result = analyzeXml(xml);

  return (
    <div className="mt-4">
      <Collapsible className="border rounded-lg">
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-left bg-gray-50 dark:bg-gray-800 rounded-t-lg">
          <span className="font-medium">Generated XML (preview)</span>
          <span className="text-xs text-gray-500">
            {result.ok ? `${result.offending.length} properties with <value> before <valueType>` : "Parse issue"}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t p-3 space-y-3">
          {result.ok && result.offending.length > 0 && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm">
              <div className="font-semibold mb-1">Potential order issues detected:</div>
              <ul className="list-disc list-inside space-y-1">
                {result.offending.map((id, i) => (
                  <li key={i}>
                    {id}: direct &lt;value&gt; appears before &lt;valueType&gt; or &lt;valueType&gt; is missing
                  </li>
                ))}
              </ul>
              <div className="text-xs text-gray-600 mt-2">
                The schema requires &lt;valueType&gt; before any direct &lt;value&gt; for Property.
              </div>
            </div>
          )}

          {!result.ok && (
            <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 p-3 text-sm">
              {result.message}
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => copyToClipboard(xml)}
              className="absolute right-2 top-2 inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Copy"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
            <pre className="max-h-72 overflow-auto text-xs bg-white dark:bg-gray-900 border rounded p-2 whitespace-pre-wrap">
{xml}
            </pre>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}