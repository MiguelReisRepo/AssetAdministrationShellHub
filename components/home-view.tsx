"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, AlertCircle } from "lucide-react";
import type { ValidationResult } from "@/lib/types";

interface HomeViewProps {
  files: ValidationResult[];
  onOpen: (index: number) => void;
}

export default function HomeView({ files, onOpen }: HomeViewProps) {
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
        <div className="mb-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Your AAS Models
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {files.length > 0
              ? `Loaded models: ${files.length}`
              : "No models loaded yet — upload or create an AAS to get started."}
          </p>
        </div>

        {files.length === 0 ? (
          <Card className="bg-white dark:bg-gray-800 border-blue-200/70 dark:border-gray-700">
            <CardContent className="flex items-center gap-3 p-6">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div className="text-sm text-gray-700 dark:text-gray-300">
                You don’t have any AAS models loaded yet.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {files.map((file, idx) => {
              const idShort = getIdShort(file);
              return (
                <Card
                  key={`${file.file}-${idx}`}
                  className="group bg-white dark:bg-gray-800 border-blue-200/70 dark:border-gray-700 hover:border-blue-400 transition-colors cursor-pointer"
                  onClick={() => onOpen(idx)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-gradient-to-br from-blue-500 to-indigo-500">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base text-gray-900 dark:text-gray-100">
                          {idShort}
                        </CardTitle>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {file.file}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {file.valid ? "Valid" : "Has issues"}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(idx);
                        }}
                      >
                        Open
                        <ArrowRight className="ml-1 w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}