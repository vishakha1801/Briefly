"use client";

import type { QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { makeAgentAction, useAgentStore } from "./agent-store";

export async function ingestCallRecap({
  customerId,
  title,
  transcript,
  callDate,
  qc,
}: {
  customerId: string;
  title?: string;
  transcript: string;
  callDate?: string;
  qc?: QueryClient;
}) {
  const store = useAgentStore.getState();
  const saveAction = makeAgentAction("save_call_context", {
    customerId,
    title,
    callDate,
  });
  store.addAction(saveAction);

  try {
    const callContext = await api.importCallContext({
      customerId,
      title,
      transcript,
      callDate,
    });
    store.updateAction(saveAction.id, { status: "success", result: callContext });

    const summaryAction = makeAgentAction("generate_call_summary", {
      customerId,
      callContextId: callContext.id,
    });
    store.addAction(summaryAction);

    try {
      const structuredNote = await api.draftNote(customerId, "");
      if ("insufficient" in structuredNote) {
        store.updateAction(summaryAction.id, {
          status: "error",
          error: "No call context available",
        });
      } else {
        const note = await api.saveNote({
          customerId,
          structuredNote,
          source: "call",
        });
        store.updateAction(summaryAction.id, {
          status: "success",
          result: { note, structuredNote, callContext },
        });
      }
    } catch (error) {
      store.updateAction(summaryAction.id, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await Promise.all([
      qc?.invalidateQueries({ queryKey: ["callContexts", customerId] }),
      qc?.invalidateQueries({ queryKey: ["customer", customerId] }),
      qc?.invalidateQueries({ queryKey: ["customers"] }),
    ]);

    store.setCenterView("recap");
    return callContext;
  } catch (error) {
    store.updateAction(saveAction.id, {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
