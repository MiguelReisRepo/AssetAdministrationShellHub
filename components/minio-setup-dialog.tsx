"use client";

import React, { useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Toaster, toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

const schema = z.object({
  endpoint: z.string().min(1, "Endpoint is required"),
  port: z.number().int().positive("Port must be a positive number"),
  useSSL: z.boolean(),
  accessKey: z.string().min(1, "Access key is required"),
  secretKey: z.string().min(1, "Secret key is required"),
  bucket: z.string().min(1, "Bucket name is required"),
});

export type MinioConfig = z.infer<typeof schema>;

const DEFAULTS: MinioConfig = {
  endpoint: "127.0.0.1",
  port: 9000,
  useSSL: false,
  accessKey: "minioadmin",
  secretKey: "minioadmin",
  bucket: "aas-models",
};

interface MinioSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (config: MinioConfig) => void;
}

export default function MinioSetupDialog({ open, onOpenChange, onSave }: MinioSetupDialogProps) {
  const form = useForm<MinioConfig>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
    mode: "onChange",
  });

  useEffect(() => {
    if (!open) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem("minioConfig") : null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        form.reset({ ...DEFAULTS, ...parsed });
      } catch {
        form.reset(DEFAULTS);
      }
    } else {
      form.reset(DEFAULTS);
    }
  }, [open, form]);

  const onSubmit = (values: MinioConfig) => {
    localStorage.setItem("minioConfig", JSON.stringify(values));
    toast.success("MinIO account saved");
    onSave?.(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>MinIO Account Sync</DialogTitle>
          <DialogDescription>Configure your MinIO connection settings.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="endpoint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endpoint</FormLabel>
                  <FormControl>
                    <Input placeholder="127.0.0.1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        value={Number.isFinite(field.value) ? field.value : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === "" ? 0 : parseInt(v, 10));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="useSSL"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center justify-between">
                      <span>Use SSL</span>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Use SSL" />
                      </FormControl>
                    </FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="accessKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Key</FormLabel>
                  <FormControl>
                    <Input placeholder="minioadmin" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="secretKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secret Key</FormLabel>
                  <FormControl>
                    <Input placeholder="minioadmin" type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bucket"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bucket</FormLabel>
                  <FormControl>
                    <Input placeholder="aas-models" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700">
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>

        <Toaster richColors closeButton />
      </DialogContent>
    </Dialog>
  );
}