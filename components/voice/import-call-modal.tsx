"use client";

import { useState } from "react";
import { UploadIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentStore } from "@/lib/agent-store";
import { ingestCallRecap } from "@/lib/call-recap-ingest";
import { toast } from "sonner";

interface ImportCallModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function ImportCallModal({ open, onOpenChange }: ImportCallModalProps) {
  const selectedId = useAgentStore((s) => s.selectedCustomerId);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    title: "Untitled",
    transcript: "",
    callDate: today,
  });

  function reset() {
    setForm({ title: "Untitled", transcript: "", callDate: today });
  }

  function handleClose(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) {
      toast.error("Select a customer first");
      return;
    }
    if (!form.transcript.trim()) return;
    setSaving(true);
    try {
      await ingestCallRecap({
        customerId: selectedId,
        title: form.title || undefined,
        transcript: form.transcript.trim(),
        callDate: form.callDate || undefined,
        qc,
      });
      toast.success("Transcript saved.");
      handleClose(false);
    } catch {
      toast.error("Failed to save transcript");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass-strong flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <UploadIcon className="size-4 text-muted-foreground" />
            Import call transcript
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ic-title" className="text-xs">Call title</Label>
              <Input
                id="ic-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Discovery call – May 24"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ic-date" className="text-xs">Call date</Label>
              <Input
                id="ic-date"
                type="date"
                value={form.callDate}
                onChange={(e) => setForm((f) => ({ ...f, callDate: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ic-transcript" className="text-xs">
              Transcript <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id="ic-transcript"
              value={form.transcript}
              onChange={(e) => setForm((f) => ({ ...f, transcript: e.target.value }))}
              placeholder="Paste the call transcript here. The agent will use this to answer questions like 'summarize our last call' or 'what objections did they raise?'"
              rows={8}
              className="max-h-64 resize-y text-sm leading-relaxed"
              required
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              {form.transcript.length > 0 && `${form.transcript.length} characters`}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !form.transcript.trim() || !selectedId}
            >
              {saving ? "Saving…" : "Save transcript"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
