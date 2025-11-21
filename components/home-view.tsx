"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, AlertCircle, CheckCircle, Upload, Plus } from "lucide-react";
import type { ValidationResult } from "@/lib/types";

interface HomeViewProps {
  files: ValidationResult[];
  onOpen: (index: number) => void;
  onUploadClick: () => void;
  onCreateClick: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export default function HomeView({ files, onOpen, onUploadClick, onCreateClick, onReorder }: HomeViewProps) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  const getIdShort = (file: ValidationResult): string => {
    const idShort =
      (file.aasData as any)?.assetAdministrationShells?.[0]?.idShort ||
      (file.parsed as any)?.assetAdministrationShells?.[0]?.idShort ||
      "";
    return idShort || file.file || "AAS";
  };

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
                ? `Loaded models: ${files.length}`
                : "No models loaded yet — upload or create an AAS to get started."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={onUploadClick}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Data
            </Button>
            <Button
              onClick={onCreateClick}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create AAS
            </Button>
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
            {files.map((file, idx) => {
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
                  {file.valid !== undefined && (
                    <div className="absolute top-2 right-2">
                      {file.valid ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-[8px] font-semibold text-green-600 uppercase tracking-tight">
                            IDTA
                          </span>
                        </div>
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                  )}
                  <div className="flex h-full">
                    {/* Left: Square thumbnail with full card height */}
                    <div className="h-full aspect-square rounded-l overflow-hidden bg-gray-100 flex items-center justify-center">
                      {file.thumbnail ? (
                        <img
                          src={thumb}
                          alt={`${idShort} thumbnail`}
                          className="w-full h-full object-cover"
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
    </div>
  );
}