import "server-only";
import { buildSeed, buildSeedCallContexts } from "./seed";
import type { CallContext, Customer, Note, Task, Priority } from "./types";

/**
 * In-memory persistence for the mocked backend the agent's tools call. A real
 * build would use a database; here it's a process-wide Map that resets on
 * restart. Stashed on globalThis so dev hot-reload doesn't wipe it.
 */
type Store = {
  customers: Map<string, Customer>;
  callContexts: Map<string, CallContext[]>;
};

const g = globalThis as unknown as { __salespilot?: Store };

function init(): Store {
  const customers = new Map<string, Customer>();
  for (const c of buildSeed()) customers.set(c.id, c);
  return { customers, callContexts: buildSeedCallContexts() };
}

const store: Store = g.__salespilot ?? (g.__salespilot = init());

export const newId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export function listCustomers(): Customer[] {
  return [...store.customers.values()].sort(
    (a, b) =>
      new Date(b.lastContact).getTime() - new Date(a.lastContact).getTime()
  );
}

export function getCustomer(id: string): Customer | undefined {
  return store.customers.get(id);
}

export function searchCustomers(query: string): Customer[] {
  const q = query.trim().toLowerCase();
  if (!q) return listCustomers();
  return listCustomers().filter((c) =>
    [c.name, c.company, c.email, c.stage].join(" ").toLowerCase().includes(q)
  );
}

/**
 * Lenient fuzzy match across first name, last name, company and email. Returns
 * the top matches with a 0..1 confidence so the agent can disambiguate.
 */
export function searchCustomersFuzzy(
  query: string,
  limit = 3
): { customer: Customer; confidence: number }[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return listCustomers()
      .slice(0, limit)
      .map((customer) => ({ customer, confidence: 0.4 }));
  }

  const scored = listCustomers().map((c) => {
    const [firstName, ...rest] = c.name.toLowerCase().split(" ");
    const lastName = rest.join(" ");
    const fields = [firstName, lastName, c.company.toLowerCase(), c.email.toLowerCase()];
    let score = 0;
    for (const token of tokens) {
      let best = 0;
      for (const field of fields) {
        if (!field) continue;
        if (field === token) best = Math.max(best, 1);
        else if (field.startsWith(token)) best = Math.max(best, 0.85);
        else if (field.includes(token)) best = Math.max(best, 0.6);
      }
      score += best;
    }
    return { customer: c, confidence: Math.min(1, score / tokens.length) };
  });

  return scored
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

export function addNote(args: {
  customerId: string;
  headline: string;
  body: string;
  source?: "manual" | "call";
}): Note | undefined {
  const c = store.customers.get(args.customerId);
  if (!c) return undefined;
  const note: Note = {
    id: newId("note"),
    customerId: args.customerId,
    createdAt: new Date().toISOString(),
    headline: args.headline,
    body: args.body,
    source: args.source ?? "call",
  };
  c.notes.unshift(note);
  c.lastContact = note.createdAt;
  return note;
}

export function updateNote(args: {
  noteId: string;
  headline: string;
  body: string;
}): Note | undefined {
  for (const c of store.customers.values()) {
    const note = c.notes.find((n) => n.id === args.noteId);
    if (!note) continue;
    note.headline = args.headline;
    note.body = args.body;
    c.lastContact = new Date().toISOString();
    return note;
  }
  return undefined;
}

export function createCustomer(args: {
  name: string;
  company: string;
  email?: string;
  phone?: string;
  stage?: string;
  notes?: string;
}): Customer {
  const id = newId("cus");
  const now = new Date().toISOString();
  const initialNotes: Note[] = args.notes
    ? [
        {
          id: newId("note"),
          customerId: id,
          createdAt: now,
          headline: args.notes.slice(0, 60),
          body: args.notes,
          source: "manual",
        },
      ]
    : [];
  const validStages = ["Discovery", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
  const stage = validStages.includes(args.stage ?? "") ? (args.stage as Customer["stage"]) : "Discovery";
  const customer: Customer = {
    id,
    name: args.name,
    company: args.company,
    email: args.email ?? "",
    phone: args.phone ?? "",
    stage,
    lastContact: now,
    createdAt: now,
    notes: initialNotes,
    tasks: [],
  };
  store.customers.set(id, customer);
  return customer;
}

export function addCallContext(args: {
  customerId: string;
  title: string;
  transcript: string;
  participants?: string;
  callDate?: string;
}): CallContext | undefined {
  if (!store.customers.has(args.customerId)) return undefined;
  const ctx: CallContext = {
    id: newId("call"),
    customerId: args.customerId,
    title: args.title || "Call transcript",
    transcript: args.transcript,
    participants: args.participants,
    callDate: args.callDate,
    createdAt: new Date().toISOString(),
  };
  const existing = store.callContexts.get(args.customerId) ?? [];
  store.callContexts.set(args.customerId, [ctx, ...existing]);
  // Update lastContact on the customer
  const customer = store.customers.get(args.customerId);
  if (customer) customer.lastContact = ctx.createdAt;
  return ctx;
}

export function getCallContexts(customerId: string): CallContext[] {
  return store.callContexts.get(customerId) ?? [];
}

export function setTaskDone(taskId: string, done: boolean): Task | undefined {
  for (const c of store.customers.values()) {
    const t = c.tasks.find((t) => t.id === taskId);
    if (t) {
      t.done = done;
      return t;
    }
  }
  return undefined;
}

export function updateTask(args: {
  taskId: string;
  title?: string;
  dueDate?: string;
  priority?: Priority;
  done?: boolean;
}): Task | undefined {
  for (const c of store.customers.values()) {
    const task = c.tasks.find((t) => t.id === args.taskId);
    if (!task) continue;
    if (args.title !== undefined) task.title = args.title;
    if (args.dueDate !== undefined) task.dueDate = args.dueDate || undefined;
    if (args.priority !== undefined) task.priority = args.priority;
    if (args.done !== undefined) task.done = args.done;
    return task;
  }
  return undefined;
}

export function addTask(args: {
  customerId: string;
  title: string;
  dueDate?: string;
  priority?: Priority;
  source?: "manual" | "call";
}): Task | undefined {
  const c = store.customers.get(args.customerId);
  if (!c) return undefined;
  const task: Task = {
    id: newId("task"),
    customerId: args.customerId,
    title: args.title,
    dueDate: args.dueDate,
    priority: args.priority ?? "med",
    done: false,
    createdAt: new Date().toISOString(),
    source: args.source ?? "call",
  };
  c.tasks.unshift(task);
  return task;
}
