"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronDownIcon, PlusIcon, UserRoundIcon, XIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomers, useCustomer, useCreateCustomer } from "@/lib/hooks";
import { useAgentStore } from "@/lib/agent-store";
import { relativeDate } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STAGES = [
  "Discovery",
  "Qualification",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
] as const;

type View = "list" | "create";

export function ContextChip() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const { data: customers } = useCustomers();
  const selectedId = useAgentStore((s) => s.selectedCustomerId);
  const switchCustomer = useAgentStore((s) => s.switchCustomer);
  const { data: customer } = useCustomer(selectedId ?? "");
  const createCustomer = useCreateCustomer();

  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    stage: "Discovery",
    notes: "",
  });

  function resetForm() {
    setForm({ name: "", company: "", email: "", phone: "", stage: "Discovery", notes: "" });
    setView("list");
  }

  function handleClose(o: boolean) {
    if (!o) resetForm();
    setOpen(o);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.company.trim()) return;
    try {
      const result = await createCustomer.mutateAsync({
        name: form.name.trim(),
        company: form.company.trim(),
        email: form.email || undefined,
        phone: form.phone || undefined,
        stage: form.stage,
        notes: form.notes || undefined,
      });
      switchCustomer(result.id);
      toast.success(`${result.name} added as active context`);
      handleClose(false);
    } catch {
      toast.error("Failed to create customer");
    }
  }

  return (
    <>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(true)}
        className="glass-chip flex h-8 max-w-[56vw] items-center gap-2 rounded-sm px-2.5 text-xs text-foreground/90 transition-colors hover:bg-white/55 sm:max-w-sm"
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-xs bg-brand/10 text-brand">
          <UserRoundIcon className="size-3" />
        </span>
        {customer ? (
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground">Context:</span>{" "}
            <span className="font-medium">{customer.name}</span>
            <span className="text-muted-foreground"> · {customer.company}</span>
          </span>
        ) : (
          <span className="min-w-0 truncate text-muted-foreground">Add customer context</span>
        )}
        <ChevronDownIcon className="size-3.5 shrink-0 text-brand/70" />
      </motion.button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="glass-panel !max-w-none flex h-[min(54vh,410px)] w-[min(770px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg p-0 ![background:oklch(1_0_0/0.88)]"
          showCloseButton={false}
        >
          <DialogHeader className="flex flex-row items-center justify-between border-b border-brand/8 bg-white/30 px-4 py-3">
            <DialogTitle className="text-sm font-semibold tracking-tight">
              {view === "create" ? "New customer" : "Customer context"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Search, select, clear, or create the active customer context.
            </DialogDescription>
            <DialogClose className="grid size-6 place-items-center rounded-xs text-muted-foreground transition-colors hover:bg-white/50 hover:text-foreground">
              <XIcon className="size-3.5" />
            </DialogClose>
          </DialogHeader>

          {view === "list" ? (
            <Command className="flex min-h-0 flex-1 rounded-none bg-transparent px-4 pb-4 pt-3 text-foreground [&_[cmdk-group-heading]]:px-0 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[data-slot=command-group]]:p-0 [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=input-group]]:h-9! [&_[data-slot=input-group]]:rounded-sm! [&_[data-slot=input-group]]:border-brand/10 [&_[data-slot=input-group]]:bg-white/45 [&_[data-slot=input-group]]:shadow-none!">
              <CommandInput
                placeholder="Search customers…"
                className="text-sm placeholder:text-muted-foreground/80"
              />
              <CommandList className="thin-scroll mt-2 min-h-0 flex-1">
                <CommandEmpty className="py-8 text-sm text-muted-foreground">No customers found.</CommandEmpty>
                <CommandGroup className="pb-0">
                  <CommandItem
                    value="__create"
                    onSelect={() => setView("create")}
                    className="h-9 rounded-sm border border-brand/14 bg-brand/8 px-2.5 text-sm font-semibold text-brand shadow-[0_1px_4px_rgba(59,73,234,0.06)] transition-colors data-selected:bg-brand/12 data-selected:border-brand/20"
                  >
                    <PlusIcon className="size-3.5" />
                    Create new customer
                  </CommandItem>
                </CommandGroup>
                {selectedId && (
                  <CommandGroup className="mt-2 pb-0">
                    <CommandItem
                      value="__clear"
                      onSelect={() => {
                        switchCustomer(null);
                        handleClose(false);
                      }}
                      className="h-9 rounded-sm border border-rose-400/15 bg-white/35 px-2.5 text-sm font-medium text-rose-400/80 transition-colors data-selected:border-rose-400/25 data-selected:bg-rose-500/5 data-selected:text-rose-500"
                    >
                      <XIcon className="size-3.5" />
                      Clear context
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup heading="Customers">
                  {customers?.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.company} ${c.email}`}
                      onSelect={() => {
                        switchCustomer(c.id);
                        handleClose(false);
                      }}
                      className={cn(
                        "mb-1 grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-sm border border-brand/8 bg-white/45 px-2.5 py-2 transition-colors data-selected:border-brand/18 data-selected:bg-white/70 data-selected:text-foreground",
                        selectedId === c.id && "border-brand/20 bg-white/75"
                      )}
                    >
                      <div className="flex min-w-0 flex-col justify-center">
                        <div className="truncate text-sm font-semibold leading-tight text-foreground/90">{c.name}</div>
                        <div className="truncate text-xs leading-tight text-muted-foreground">{c.company}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end justify-center text-right leading-tight">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                          Last contact
                        </span>
                        <span className="mt-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                          {relativeDate(c.lastContact)}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          ) : (
            <form onSubmit={handleCreate} className="thin-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cc-name" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Name <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="cc-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Jane Smith"
                    className="h-9 rounded-sm border-brand/10 bg-white/45 text-sm focus-visible:border-brand/25 focus-visible:ring-brand/10"
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cc-company" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Company <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="cc-company"
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                    placeholder="Acme Corp"
                    className="h-9 rounded-sm border-brand/10 bg-white/45 text-sm focus-visible:border-brand/25 focus-visible:ring-brand/10"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cc-email" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Email</Label>
                  <Input
                    id="cc-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="jane@acme.com"
                    className="h-9 rounded-sm border-brand/10 bg-white/45 text-sm focus-visible:border-brand/25 focus-visible:ring-brand/10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cc-phone" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Phone</Label>
                  <Input
                    id="cc-phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+1 (555) …"
                    className="h-9 rounded-sm border-brand/10 bg-white/45 text-sm focus-visible:border-brand/25 focus-visible:ring-brand/10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cc-stage" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Stage
                </Label>
                <Select
                  value={form.stage}
                  onValueChange={(v) => setForm((f) => ({ ...f, stage: v }))}
                >
                  <SelectTrigger id="cc-stage" className="h-9 rounded-sm border-brand/10 bg-white/45 text-sm focus-visible:border-brand/25 focus-visible:ring-brand/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-sm border-brand/10 bg-white/95 backdrop-blur-xl ![background:oklch(1_0_0/0.96)]">
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cc-notes" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Notes / context</Label>
                <Textarea
                  id="cc-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any initial context about this customer…"
                  rows={2}
                  className="min-h-20 resize-none rounded-sm border-brand/10 bg-white/45 text-sm focus-visible:border-brand/25 focus-visible:ring-brand/10"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setView("list")}
                  className="rounded-sm text-muted-foreground hover:bg-white/45 hover:text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createCustomer.isPending || !form.name.trim() || !form.company.trim()}
                  className={cn("rounded-sm bg-brand shadow-[0_8px_18px_rgba(26,26,26,0.08),0_2px_8px_rgba(59,73,234,0.12),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-brand/90", createCustomer.isPending && "opacity-70")}
                >
                  {createCustomer.isPending ? "Creating…" : "Create customer"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
