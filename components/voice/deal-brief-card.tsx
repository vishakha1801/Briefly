"use client";

import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  CopyIcon,
  Loader2Icon,
  MessageSquareQuoteIcon,
  ShieldAlertIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/lib/agent-store";
import type { DealBrief } from "@/lib/types";

export function DealBriefCard({
  onCreateFollowUp,
}: {
  onCreateFollowUp: (title: string) => void;
}) {
  const brief = useAgentStore((s) => s.dealBrief);
  const loading = useAgentStore((s) => s.briefLoading);

  if (loading || !brief) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2Icon className="size-6 animate-spin text-brand" />
          <p className="text-sm text-muted-foreground">Building talking points…</p>
        </div>
      </div>
    );
  }

  function copyTalkTrack() {
    if (!brief) return;
    navigator.clipboard?.writeText(brief.suggestedTalkTrack.replace(/^"|"$/g, ""));
    toast.success("Talk track copied");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="thin-scroll h-full overflow-y-auto p-4 sm:p-5"
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">
            {brief.customerName}
          </h2>
          <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
            <SparklesIcon className="size-3" />
            Talking points
          </p>
        </div>

        <div className="space-y-3">
          <Row icon={<ZapIcon className="size-4" />} label="Lead with">
            <p className="text-xs font-medium leading-relaxed text-brand">
              {brief.leadWith}
            </p>
          </Row>

          <Row icon={<SparklesIcon className="size-4" />} label="Customer concern">
            <List items={brief.customerConcern} />
          </Row>

          <Row icon={<ShieldAlertIcon className="size-4" />} label="Likely objection">
            <List items={brief.likelyObjection} />
          </Row>

          <Row
            icon={<MessageSquareQuoteIcon className="size-4" />}
            label="Suggested talk track"
          >
            <p className="rounded-sm border border-brand/8 bg-white/25 p-3 text-xs italic leading-relaxed text-foreground/90 backdrop-blur-sm">
              {brief.suggestedTalkTrack}
            </p>
          </Row>

          <Row icon={<ArrowRightIcon className="size-4" />} label="Recommended next step">
            <p className="text-xs leading-relaxed text-foreground/90">
              {brief.recommendedNextStep}
            </p>
          </Row>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button size="sm" onClick={() => onCreateFollowUp(brief.recommendedNextStep)}>
            Create follow-up task
          </Button>
          <Button size="sm" variant="outline" onClick={copyTalkTrack} className="h-8 text-xs">
            <CopyIcon className="size-3.5" />
            Copy talk track
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-xs bg-brand/10 text-brand">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-xs leading-relaxed text-foreground/90">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
          {it}
        </li>
      ))}
    </ul>
  );
}

export type { DealBrief };
