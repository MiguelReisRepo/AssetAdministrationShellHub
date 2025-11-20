"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";

type KeyEntry = { type?: string; value?: string };
type ReferenceLike = { keys?: KeyEntry[] } & Record<string, any>;

interface KeysEditorProps {
  reference: ReferenceLike | null | undefined;
  editable?: boolean;
  onChange: (next: ReferenceLike) => void;
  title?: string;
}

const KeysEditor: React.FC<KeysEditorProps> = ({ reference, editable = true, onChange, title = "Keys" }) => {
  const keys: KeyEntry[] = Array.isArray(reference?.keys) ? reference!.keys! : [];

  const updateKey = (idx: number, patch: Partial<KeyEntry>) => {
    const nextKeys = keys.map((k, i) => (i === idx ? { ...k, ...patch } : k));
    const nextRef: ReferenceLike = { ...(reference || {}), keys: nextKeys };
    onChange(nextRef);
  };

  const addKey = () => {
    const nextKeys = [...keys, { type: "", value: "" }];
    const nextRef: ReferenceLike = { ...(reference || {}), keys: nextKeys };
    onChange(nextRef);
  };

  const removeKey = (idx: number) => {
    const nextKeys = keys.filter((_, i) => i !== idx);
    const nextRef: ReferenceLike = { ...(reference || {}), keys: nextKeys };
    onChange(nextRef);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase">{title}</h5>
        {editable && (
          <Button variant="outline" size="sm" onClick={addKey}>
            <Plus className="w-3 h-3 mr-1" /> Add key
          </Button>
        )}
      </div>

      {keys.length === 0 ? (
        <div className="text-xs text-gray-600 dark:text-gray-400">
          No keys{editable ? " — click Add key to create one." : "."}
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((k, idx) => (
            <div key={idx} className="p-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
                  {editable ? (
                    <Input
                      value={k.type ?? ""}
                      onChange={(e) => updateKey(idx, { type: e.target.value })}
                      placeholder="e.g., ConceptDescription"
                      className="font-mono text-xs"
                    />
                  ) : (
                    <div className="text-xs font-mono">{k.type ?? ""}</div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Value</label>
                  {editable ? (
                    <Input
                      value={k.value ?? ""}
                      onChange={(e) => updateKey(idx, { value: e.target.value })}
                      placeholder="e.g., 0173-1#02-AAO677#002"
                      className="font-mono text-xs"
                    />
                  ) : (
                    <div className="text-xs font-mono break-all">{k.value ?? ""}</div>
                  )}
                </div>
              </div>
              {editable && (
                <div className="mt-2 flex justify-end">
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => removeKey(idx)} title="Remove key">
                    <X className="w-3 h-3 mr-1" /> Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default KeysEditor;