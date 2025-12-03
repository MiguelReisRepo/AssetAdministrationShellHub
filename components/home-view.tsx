"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, AlertCircle, CheckCircle, Upload, Plus, X } from "lucide-react";
import { FileText as _FileText, ArrowRight as _ArrowRight, AlertCircle as _AlertCircle, CheckCircle as _CheckCircle, Upload as _Upload, Plus as _Plus, X as _X } from "lucide-react";
import { CloudDownload } from "lucide-react";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import type { ValidationResult } from "@/lib/types";
import MinioImportDialog from "@/components/minio-import-dialog";
import { toast } from "sonner";

interface HomeViewProps {
  files: ValidationResult[];
  onOpen: (index: number) => void;
  onUploadClick: () => void;
  onCreateClick: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (index: number) => void;
  onImportFromMinio?: (keys: string[]) => void;
}

export default function HomeView({ files, onOpen, onUploadClick, onCreateClick, onReorder, onDelete, onImportFromMinio }: HomeViewProps) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [selectedSubmodels, setSelectedSubmodels] = React.useState<Set<string>>(new Set());
  const [validityFilter, setValidityFilter] = React.useState<"all" | "valid" | "invalid">("all");
  const [openImportDialog, setOpenImportDialog] = React.useState<boolean>(false);

  const getIdShort = (file: ValidationResult): string => {
    const idShort =
      (file.aasData as any)?.assetAdministrationShells?.[0]?.idShort ||
      (file.parsed as any)?.assetAdministrationShells?.[0]?.idShort ||
      "";
    return idShort || file.file || "AAS";
  };

  const extractSubmodelNames = (file: ValidationResult): string[] => {
    const subs = ((file.aasData as any)?.submodels || (file.parsed as any)?.submodels || [])
      .map((sm: any) => sm?.idShort)
      .filter(Boolean);
    if (subs.length) return Array.from(new Set(subs));
    const refs = ((file.aasData as any)?.assetAdministrationShells?.[0]?.submodels ||
      (file.parsed as any)?.assetAdministrationShells?.[0]?.submodels ||
      []);
    const fromRefs = refs
      .map((ref: any) => ref?.idShort || ref?.keys?.[0]?.value || ref?.keys?.[0]?.idShort)
      .filter(Boolean);
    return Array.from(new Set(fromRefs));
  };

  const allSubmodelOptions = React.useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => {
      extractSubmodelNames(f).forEach((name) => set.add(name));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const filteredFiles = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasSubmodelFilter = selectedSubmodels.size > 0;
    return files.filter((file) => {
      const idShort = getIdShort(file).toLowerCase();
      const filename = (file.file || "").toLowerCase();
      const matchesQuery = q === "" ? true : idShort.includes(q) || filename.includes(q);
      if (!matchesQuery) return false;
      if (hasSubmodelFilter) {
        const subs = extractSubmodelNames(file);
        if (!subs.some((s) => selectedSubmodels.has(s))) return false;
      }
      if (validityFilter === "valid" && file.valid !== true) return false;
      if (validityFilter === "invalid" && file.valid !== false) return false;
      return true;
    });
  }, [files, searchQuery, selectedSubmodels, validityFilter]);

  return (
    <div className="h-full overflow-auto">
      <div className="px-6 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Your AAS Models
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {files.length > 0
                ? `Showing ${filteredFiles.length} of ${files.length} models`
                : "No models loaded yet — upload or create an AAS to get started."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={onUploadClick}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload AAS
            </Button>
            <Button
              onClick={onCreateClick}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create AAS
            </Button>
            <Button
              onClick={() => setOpenImportDialog(true)}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <CloudDownload className="mr-2 h-4 w-4" />
              Import from MinIO
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by idShort or file name"
                className="pl-8 bg-white dark:bg-gray-900"
                aria-label="Search models"
              />
            </div>
            {allSubmodelOptions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-2 bg-white dark:bg-gray-900">
                    <Filter className="h-4 w-4" />
                    Submodels
                    {selectedSubmodels.size > 0 && (
                      <span className="ml-1 rounded bg-blue-600 text-white px-1.5 py-0.5 text-xs">
                        {selectedSubmodels.size}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuLabel>Filter by submodel</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {allSubmodelOptions.map((name) => (
                    <DropdownMenuCheckboxItem
                      key={name}
                      checked={selectedSubmodels.has(name)}
                      onCheckedChange={(checked) => {
                        setSelectedSubmodels((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(name);
                          else next.delete(name);
                          return next;
                        });
                      }}
                    >
                      {name}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-gray-600 hover:text-gray-900"
                    onClick={() => setSelectedSubmodels(new Set())}
                  >
                    Clear filters
                  </Button>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Select value={validityFilter} onValueChange={(v) => setValidityFilter(v as "all" | "valid" | "invalid")}>
              <SelectTrigger className="w-32 bg-white dark:bg-gray-900">
                <SelectValue placeholder="Validity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="valid">Valid</SelectItem>
                <SelectItem value="invalid">Invalid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {files.length === 0 ? (
          <Card className="bg-white dark:bg-gray-800 border-blue-200/70 dark:border-gray-700">
            <CardContent className="flex items-center gap-3 p-6">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div className="text-sm text-gray-700 dark:text-gray-300">
                You don't have any AAS models loaded yet.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredFiles.map((file, idx) => {
              const idShort = getIdShort(file);
              const thumb = file.thumbnail || "/placeholder.svg";
              return (
                <Card
                  key={`${file.file}-${idx}`}
                  className={`group relative bg-white dark:bg-gray-800 border-blue-200/70 dark:border-gray-700 hover:border-blue-400 transition-colors cursor-pointer h-44 ${dragOverIndex === idx ? 'ring-2 ring-blue-400' : ''}`}
                  onClick={() => onOpen(idx)}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(idx);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== idx) setDragOverIndex(idx);
                  }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== idx) {
                      onReorder(dragIndex, idx);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(idx);
                    }}
                    aria-label={`Remove ${idShort}`}
                    draggable={false}
                  >
                    <X className="w-4 h-4" />
                  </Button>

                  {file.valid !== undefined && (
                    <div className="absolute top-2 right-2">
                      {file.valid === true ? (
                        <div className="flex items-center gap-2 rounded-full bg-green-50 border border-green-300 px-3 py-1.5 shadow-sm">
                          <CheckCircle className="w-6 h-6 text-green-700" />
                          <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                            IDTA
                          </span>
                        </div>
                      ) : file.valid === false ? (
                        <div className="flex items-center gap-2 rounded-full bg-red-50 border border-red-300 px-3 py-1.5 shadow-sm">
                          <AlertCircle className="w-6 h-6 text-red-700" />
                          <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                            Invalid
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}
                  <div className="flex h-full">
                    {/* Left: Square thumbnail with full card height */}
                    <div className="ml-12 h-full aspect-square rounded-l overflow-hidden bg-gray-100 flex items-center justify-center">
                      {file.thumbnail ? (
                        <img
                          src={thumb}
                          alt={`${idShort} thumbnail`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <FileText className="w-6 h-6 text-gray-500" />
                      )}
                    </div>
                    {/* Right: Details and action */}
                    <div className="flex-1 flex flex-col justify-between p-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base text-gray-900 dark:text-gray-100">
                          {idShort}
                        </CardTitle>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {file.file}
                        </div>
                      </div>
                      <div className="flex items-center justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(idx);
                          }}
                        >
                          View
                          <ArrowRight className="ml-1 w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <MinioImportDialog
        open={openImportDialog}
        onOpenChange={setOpenImportDialog}
        onImport={(keys) => {
          toast.success(`Selected ${keys.length} model(s)`);
          onImportFromMinio?.(keys);
        }}
      />
    </div>
  );
}