"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DataUploader } from "@/components/data-uploader";
import type { ValidationResult } from "@/lib/types";

interface UploadDialogProps {
  onDataUploaded: (fileData: ValidationResult) => void;
  onClose: () => void;
}

export default function UploadDialog({ onDataUploaded, onClose }: UploadDialogProps) {
  const [open, setOpen] = useState(true);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) onClose();
  };

  const handleUploaded = (fileData: ValidationResult) => {
    onDataUploaded(fileData);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Data</DialogTitle>
          <DialogDescription>
            Upload an AASX archive or JSON model to add it to your workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <DataUploader onDataUploaded={handleUploaded} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}