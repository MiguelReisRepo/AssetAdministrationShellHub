"use client";

import React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";

type MinioObject = {
  name: string;
  size?: number;
  lastModified?: string | Date;
};

interface MinioImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport?: (keys: string[]) => void;
}

export default function MinioImportDialog({ open, onOpenChange, onImport }: MinioImportDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [objects, setObjects] = React.useState<MinioObject[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter((o) => o.name.toLowerCase().includes(q));
  }, [objects, query]);

  React.useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);
    setObjects([]);
    setSelected(new Set());

    const stored = typeof window !== "undefined" ? localStorage.getItem("minioConfig") : null;
    if (!stored) {
      setLoading(false);
      setError("No MinIO configuration found. Please set up your MinIO account first.");
      return;
    }

    let config: any;
    try {
      config = JSON.parse(stored);
    } catch {
      setLoading(false);
      setError("Invalid MinIO configuration in localStorage.");
      return;
    }

    fetch("/api/minio/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Failed to list objects (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        const objs: MinioObject[] = Array.isArray(data?.objects) ? data.objects : [];
        setObjects(objs);
      })
      .catch((err) => {
        setError(err.message || "Failed to load objects from MinIO.");
      })
      .finally(() => setLoading(false));
  }, [open]);

  const toggle = (name: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((o) => next.add(o.name));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleImport = () => {
    const keys = Array.from(selected);
    if (keys.length === 0) {
      toast.info("No models selected.");
      return;
    }
    toast.success(`Selected ${keys.length} model(s) from MinIO`);
    onImport?.(keys);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import from MinIO</DialogTitle>
          <DialogDescription>Select one or more models from your MinIO bucket.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search objects..."
              aria-label="Search objects"
              className="bg-white dark:bg-gray-900"
            />
            <Button variant="outline" onClick={selectAllVisible}>
              Select all
            </Button>
            <Button variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="text-primary" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
          ) : (
            <ScrollArea className="max-h-72 rounded border">
              <div className="p-2 space-y-1">
                {filtered.length === 0 ? (
                  <div className="text-sm text-muted-foreground px-2 py-6">No objects found.</div>
                ) : (
                  filtered.map((obj) => {
                    const isChecked = selected.has(obj.name);
                    return (
                      <label
                        key={obj.name}
                        className="flex items-center gap-3 px-2 py-2 rounded hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(v) => toggle(obj.name, Boolean(v))}
                          aria-label={`Select ${obj.name}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium">{obj.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {typeof obj.size === "number" ? `${obj.size} bytes` : "Unknown size"}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-purple-600 text-white hover:bg-purple-700" onClick={handleImport}>
            Import Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}