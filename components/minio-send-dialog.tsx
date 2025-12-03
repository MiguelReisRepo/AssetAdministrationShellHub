"use client";

import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import type { ValidationResult } from "@/lib/types";

type OriginalMap = Record<string, { name: string; base64: string; contentType?: string }>;

interface MinioSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: ValidationResult[];
  originals?: OriginalMap;
}

export default function MinioSendDialog({ open, onOpenChange, files, originals = {} }: MinioSendDialogProps) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [sending, setSending] = React.useState(false);
  const [progress, setProgress] = React.useState<{ total: number; done: number }>({ total: 0, done: 0 });

  // Persist selection across opens
  React.useEffect(() => {
    if (!open) return;
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("minioSendSelection") : null;
      if (raw) {
        const names: string[] = JSON.parse(raw);
        setSelected(new Set(names));
      }
    } catch {}
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const arr = Array.from(selected);
    localStorage.setItem("minioSendSelection", JSON.stringify(arr));
  }, [selected, open]);

  const items = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return files
      .map((f) => {
        const name = f.file || "";
        const thumb = f.thumbnail || "";
        const display = name || ((f.aasData as any)?.assetAdministrationShells?.[0]?.idShort || "Model");
        return { key: name || display, name, thumb, display };
      })
      .filter((it) => (q ? it.display.toLowerCase().includes(q) || it.name.toLowerCase().includes(q) : true));
  }, [files, query]);

  const toggle = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      items.forEach((it) => next.add(it.key));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleSend = async () => {
    if (selected.size === 0) {
      toast.info("No models selected.");
      return;
    }

    const stored = typeof window !== "undefined" ? localStorage.getItem("minioConfig") : null;
    if (!stored) {
      toast.error("MinIO is not configured. Please set up MinIO first.");
      return;
    }

    let config: any;
    try {
      config = JSON.parse(stored);
    } catch {
      toast.error("Invalid MinIO config in localStorage.");
      return;
    }

    const chosen = items.filter((it) => selected.has(it.key));
    setSending(true);
    setProgress({ total: chosen.length, done: 0 });
    toast.loading(`Sending ${chosen.length} model(s) to MinIO...`, { id: "minio-send" });

    let success = 0;
    let failed = 0;

    for (const it of chosen) {
      // Find original content for this item
      const original = originals[it.name] || originals[it.key];
      if (!original) {
        // Fallback: we cannot reconstruct original archive; skip with message
        failed += 1;
        toast.error(`Missing original file for ${it.display || it.name || "model"}. Skipped.`);
      } else {
        const fileName = original.name || it.name || `model-${Date.now()}.aasx`;
        const contentType =
          original.contentType ||
          (fileName.toLowerCase().endsWith(".aasx") ? "application/zip" : "application/octet-stream");

        const res = await fetch("/api/minio/put", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...config,
            name: fileName,
            base64: original.base64,
            contentType,
          }),
        });

        if (res.ok) {
          success += 1;
        } else {
          const data = await res.json().catch(() => ({}));
          failed += 1;
          toast.error(data?.error || `Failed to send ${fileName}`);
        }
      }
      setProgress((p) => ({ total: p.total, done: p.done + 1 }));
    }

    setSending(false);

    if (success > 0) {
      toast.success(`Successfully sent ${success} model(s) to MinIO`, { id: "minio-send" });
    } else {
      toast.error("No models were sent.", { id: "minio-send" });
    }

    // Close after completion
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send Models to MinIO</DialogTitle>
          <DialogDescription>Select models from your workspace to upload.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models..."
              aria-label="Search models"
              className="bg-white dark:bg-gray-900"
            />
            <Button variant="outline" onClick={selectAllVisible}>
              Select all
            </Button>
            <Button variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
          </div>

          <ScrollArea className="max-h-72 rounded border">
            <div className="p-2 space-y-1">
              {items.length === 0 ? (
                <div className="text-sm text-muted-foreground px-2 py-6">No models found.</div>
              ) : (
                items.map((it) => {
                  const isChecked = selected.has(it.key);
                  return (
                    <label
                      key={it.key}
                      className="flex items-center gap-3 px-2 py-2 rounded hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(v) => toggle(it.key, Boolean(v))}
                        aria-label={`Select ${it.display}`}
                      />
                      <div className="size-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                        {it.thumb ? (
                          <img src={it.thumb} alt={it.display} className="w-full h-full object-contain" />
                        ) : (
                          <FileText className="w-5 h-5 text-gray-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium">{it.display}</div>
                        <div className="text-xs text-muted-foreground truncate">{it.name || "Unnamed file"}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {sending && (
            <div className="flex items-center justify-between rounded border p-2">
              <div className="flex items-center gap-2">
                <Spinner className="text-primary" />
                <span className="text-sm">Uploading...</span>
              </div>
              <div className="text-sm">{progress.done} / {progress.total}</div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={handleSend} disabled={sending}>
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}