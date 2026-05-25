import type {
  CallContext,
  Customer,
  DealBrief,
  Note,
  Priority,
  StructuredNote,
  Task,
} from "./types";

async function json<T>(input: Response | Promise<Response>): Promise<T> {
  const res = await input;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${detail}`.trim());
  }
  return res.json() as Promise<T>;
}

export const api = {
  listCustomers: () =>
    json<{ customers: Customer[] }>(fetch("/api/customers")).then(
      (d) => d.customers
    ),

  getCustomer: (id: string) =>
    json<{ customer: Customer }>(fetch(`/api/customers/${id}`)).then(
      (d) => d.customer
    ),

  generateBrief: (customerId: string) =>
    json<DealBrief | { insufficientContext: true }>(
      fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      })
    ),

  toggleTask: (taskId: string, done: boolean) =>
    json<{ task: Task }>(
      fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, done }),
      })
    ).then((d) => d.task),

  updateTask: (args: {
    taskId: string;
    title?: string;
    dueDate?: string;
    priority?: Priority;
    done?: boolean;
  }) =>
    json<{ task: Task }>(
      fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      })
    ).then((d) => d.task),

  draftNote: (customerId: string, conversation: string) =>
    json<StructuredNote | { insufficient: true }>(
      fetch("/api/note-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, conversation }),
      })
    ),

  searchCustomerFuzzy: (query: string) =>
    json<{
      matches: Customer[];
      ranked: { id: string; name: string; company: string; confidence: number }[];
    }>(
      fetch("/api/customers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, fuzzy: true }),
      })
    ),

  getCustomerHistory: async (customerId: string) => {
    const c = await api.getCustomer(customerId);
    return { notes: c.notes, tasks: c.tasks };
  },

  saveNote: (args: {
    customerId: string;
    headline?: string;
    rawText?: string;
    structuredNote?: StructuredNote;
    source?: "manual" | "call";
  }) =>
    json<{ note: Note }>(
      fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      })
    ).then((d) => d.note),

  updateNote: (args: {
    noteId: string;
    headline: string;
    body: string;
  }) =>
    json<{ note: Note }>(
      fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      })
    ).then((d) => d.note),

  createTask: (args: {
    customerId: string;
    title: string;
    dueDate?: string;
    priority?: Priority;
    source?: "manual" | "call";
  }) =>
    json<{ task: Task }>(
      fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      })
    ).then((d) => d.task),

  createCustomer: (args: {
    name: string;
    company: string;
    email?: string;
    phone?: string;
    stage?: string;
    notes?: string;
  }) =>
    json<{ customer: Customer }>(
      fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      })
    ).then((d) => d.customer),

  importCallContext: (args: {
    customerId: string;
    title?: string;
    transcript: string;
    participants?: string;
    callDate?: string;
  }) =>
    json<{ callContext: CallContext }>(
      fetch("/api/calls/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      })
    ).then((d) => d.callContext),

  getCallContexts: (customerId: string) =>
    json<{ contexts: CallContext[] }>(
      fetch(`/api/customers/${customerId}/context`)
    ).then((d) => d.contexts),

  transcribeAudio: (file: File) => {
    const form = new FormData();
    form.append("audio", file);
    return json<{ transcript: string }>(
      fetch("/api/calls/transcribe", { method: "POST", body: form })
    );
  },
};
