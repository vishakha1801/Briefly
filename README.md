# Briefly — Voice-first sales co-pilot

**Briefly** is a voice-first co-pilot for sales reps. It lets a rep talk to an
AI agent during or after a customer call to capture context, generate structured
post-call notes, and create follow-up tasks — all without leaving a single screen.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui ·
Zustand · React Query · Motion · OpenAI Realtime API (WebRTC)

---

## 1. Setup

```bash
pnpm install
cp .env.example .env.local   # add OPENAI_API_KEY for live voice
pnpm dev                      # http://localhost:3000
```

Without `OPENAI_API_KEY` the voice session will not start; all other UI flows
(recap, notes, tasks) remain functional via the text command bar.

```bash
pnpm build && pnpm start   # production
```

### Deploy to Vercel

1. Push to GitHub and import the repo in Vercel.
2. Add `OPENAI_API_KEY` under **Project → Settings → Environment Variables**.
3. Deploy. The in-memory store resets on cold start (see Limitations).

---

## 2. Core flow

The workspace has three tabs in the center panel:

### Conversation
Live voice and text interaction with the agent. The rep can speak hands-free
or type. All turns appear in the live transcript. Editable — tap any turn to
correct it before the agent acts on it.

### Call recap
This is where context lives. Before generating notes or asking grounded
questions, the rep sources what happened on the call by:

- **Pasting or importing a transcript** (via the Import button or the
  "Import transcript" chip)
- **Dictating a recap** — tap "Record recap" to speak a summary
- **Typing notes** freeform

The recap stays in this tab; it does not appear as a giant user message in
the Conversation view.

### Post-call notes
After adding a recap, the rep taps **"Generate post-call notes"**. The agent
produces a structured draft (key points, action items, sentiment). The rep
reviews and edits the draft inline, then manually saves it. Notes do not
auto-save.

---

## 3. Quick actions

Three chips appear below the orb:

| Action | What it does |
|---|---|
| **Get talking points** | Generates a pre-call brief for the selected customer: lead-with, concerns, likely objections, suggested talk track, recommended next step. Prompts for recap context if none exists. |
| **Add call recap** | Opens the Call recap tab to add context. |
| **Generate post-call notes** | Triggers note generation from the current recap. Available once recap context exists. |

---

## 4. Layout

### Desktop (≥ 1024 px)

```
┌──────────────────────────── Top bar ─────────────────────────────┐
│  Briefly logo          [Customer context chip ▼]                 │
├─────────────────── Center workspace ──────────────┬── Sidebar ───┤
│  [Orb] Status                                     │ Customer tab │
│  [ Get talking points ]                           │  card        │
│  [ suggestion chips — only when context missing ] │  tasks       │
│                                                   ├──────────────┤
│  ┌─ Conversation | Call recap | Post-call notes ┐ │ Actions tab  │
│  │                                              │ │  tool feed   │
│  │  (active tab content)                        │ ├──────────────┤
│  │                                              │ │ Notes tab    │
│  └──────────────────────────────────────────────┘ │  saved notes │
│  [Mic] [type a command…] [↑]  (voice mode toggle) │              │
└───────────────────────────────────────────────────┴──────────────┘
```

**Center** — primary workspace. Three-tab navigation (Conversation / Call recap /
Post-call notes) + command bar.

**Right sidebar** — three tabs:
- **Customer** — contact card and open tasks for the selected customer.
- **Actions** — every tool call the agent made this session, expandable to
  args / result / error.
- **Notes** — saved post-call notes.

### Mobile (< 1024 px)

Single-column layout. The sidebar becomes a slide-in sheet triggered by the
action-count button in the top bar. The command bar is a two-row sticky
composer at the bottom: PTT / Hands-free toggle on row 1; mic + text input +
send on row 2.

---

## 5. Real-time transport: why WebRTC

WebRTC is the right choice here for three reasons:

1. **Audio is first-class.** The browser's WebRTC stack handles jitter
   buffering, echo cancellation, and packet-loss recovery — concerns that would
   require manual handling over raw WebSocket PCM.
2. **Ephemeral token model.** The OpenAI Realtime API issues a short-lived
   `client_secret` from the server (`/api/realtime/session`), then the browser
   peers directly with OpenAI. The API key never touches the client.
3. **Lower latency.** For sub-second agent voice replies, eliminating the
   WebSocket relay hop matters.

Tool calls and transcripts travel over the same connection via WebRTC's
`oai-events` data channel.

---

## 6. Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │               Browser (rep)                  │
                    │                                              │
 mic (getUserMedia)─▶  RTCPeerConnection ──────────────────┐      │
                    │   • audio in/out                      │      │
                    │   • "oai-events" data channel         │      │
                    └──────┼────────────────────────────────┼──────┘
                           │ ephemeral token                │ SDP
                           ▼                                ▼
      ┌──────────────────────────────┐  ┌──────────────────────────────┐
      │  /api/realtime/session       │  │  OpenAI Realtime API          │
      │  mints ephemeral secret      │  │  (WebRTC, gpt-realtime-2)     │
      └──────────────────────────────┘  └──────────────────────────────┘

  Tool calls resolve against mocked Next.js route handlers:

    data-channel call ──▶ /api/customers/search       (search_customer)
                      ──▶ /api/customers/[id]          (get_customer_history)
                      ──▶ /api/notes                   (save_note)
                      ──▶ /api/tasks                   (create_task)
                      ──▶ /api/customers  POST         (create_customer)
                      ──▶ /api/calls/import            (save_call_context)
                      ──▶ /api/customers/[id]/context  (get_call_context)
                      ──▶ /api/brief                   (deal brief generation)
```

Client state lives in **Zustand** (`lib/agent-store.ts`); customer data is
fetched with **React Query**. Persistence is an in-memory `Map` (`lib/store.ts`),
seeded with 8 customers.

---

## 7. Route map

| Route | Method | Purpose |
|---|---|---|
| `/` | — | Full experience (single page) |
| `/api/realtime/session` | POST | Mints ephemeral Realtime token |
| `/api/customers` | GET | Customer list |
| `/api/customers` | POST | Create a new customer |
| `/api/customers/search` | POST | Fuzzy search → `search_customer` |
| `/api/customers/[id]` | GET | Customer profile → `get_customer_history` |
| `/api/customers/[id]/context` | GET | Saved call context → `get_call_context` |
| `/api/notes` | POST | Persist a note → `save_note` |
| `/api/tasks` | POST | Create follow-up task → `create_task` |
| `/api/calls/import` | POST | Import transcript → `save_call_context` |
| `/api/brief` | POST | Generate pre-call talking points |

---

## 8. Agent tools

| Tool | Args | What it does |
|---|---|---|
| `search_customer` | `query` | Fuzzy-matches name/company |
| `get_customer_history` | `customerId` | Returns notes + open tasks |
| `save_note` | `customerId, rawText` | Persists a structured note |
| `create_task` | `customerId, title, dueDate?, priority?` | Creates follow-up; parses natural dates via chrono-node |
| `create_customer` | `name, company, email?, phone?, stage?` | Creates + auto-selects the new customer |
| `save_call_context` | `customerId, transcript, title?` | Saves a call transcript |
| `get_call_context` | `customerId` | Retrieves saved transcripts |

The agent always calls tools before answering customer-specific questions and
never invents data — pricing, objections, and next steps come from actual tool
results. It confirms completed actions aloud and stays brief unless asked for
more.

---

## 9. Demo walkthrough

1. **Select a customer** — click the context chip (top bar) and choose a
   seeded customer, or create a new one by voice: *"Create a customer named
   Tariq Bello at Cobalt Studios."*

2. **Add a call recap** — switch to the **Call recap** tab. Paste a transcript
   or tap **"Record recap"** to dictate what happened on the call.
   ```
   Rep: What's your main frustration right now?
   Tariq: Reporting is terrible — we can't see what's working.
   Rep: Budget-wise, what are we looking at?
   Tariq: Flexible, but finance needs to approve. Probably 30 days.
   Rep: I'll send a proposal this week.
   ```

3. **Generate post-call notes** — tap **"Generate post-call notes"**. The
   agent reads the recap and produces a structured draft: key takeaways,
   blockers, and suggested next steps.

4. **Review, edit, and save** — edit the draft inline, then click **Save**.
   The note appears in the **Notes** tab of the right sidebar.

5. **Create a follow-up task** — say or type: *"Remind me to send the proposal
   next Friday."* The agent calls `create_task` with the parsed date and
   confirms aloud. The task appears on the Customer tab.

6. **Inspect tool calls** — open the **Actions** tab in the right sidebar to
   see every tool call made this session: name, arguments, status, and result.

---

## 10. Optional goals implemented

| Goal | Status |
|---|---|
| Responsive desktop + mobile | ✅ 3-zone desktop, bottom composer + sheet on mobile |
| Real-time transcription (editable turns) | ✅ tap any turn to correct it |
| Mocked real tool integration | ✅ 7 tools, 8 route handlers |
| Action feed with args / status / result | ✅ Actions tab in sidebar |
| Pre-call talking points (deal brief) | ✅ "Get talking points" quick action |

---

## 11. Known limitations

- **In-memory persistence** — customer data, notes, and tasks reset on server
  restart / Vercel cold start.
- **Mocked backend** — no external CRM, calendar, or notes system integration.
- **Single session** — no authentication; all users share the same in-memory
  store on a given server instance.
- **Task confirmation is voice/text only** — there is no dedicated task-creation
  form; tasks are created through the agent.
# Briefly — Voice-first sales co-pilot

**Briefly** is a voice-first sales co-pilot for reps who need to turn messy call context into clear notes, follow-ups, and next-step guidance.

The app lets a rep talk to an AI agent during or after a customer call, add context from a transcript or quick recap, generate structured post-call notes, and create follow-up tasks from one focused workspace.

This prototype was built for the **Instalily AI case study**.

**Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, React Query, Motion, and the OpenAI Realtime API over WebRTC.

---

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Add `OPENAI_API_KEY` to `.env.local` to enable live voice.

```bash
pnpm build && pnpm start
```

Without `OPENAI_API_KEY`, live voice will not start. The rest of the product flow still works locally through the text command bar, including customer context, call recap, post-call notes, tasks, and the action feed.

To deploy, push the repo to GitHub, import it into Vercel, add `OPENAI_API_KEY` under **Project Settings → Environment Variables**, and deploy.

The app uses an in-memory store, so seeded customer data, notes, and tasks reset on server restart or Vercel cold start.

---

## Product idea

Sales calls create messy context. A rep might have a transcript, a rough memory of what happened, a few objections, a couple of follow-ups, and no clean place to turn that into something useful.

Briefly is designed around one simple flow:

```txt
Conversation → Call recap → Post-call notes → Follow-up task
```

The agent does not pretend to know what happened on a call. The rep gives it call context first, either by importing a transcript, dictating a recap, or typing rough notes. Briefly then turns that context into a concise recap, structured post-call notes, and suggested next steps.

---

## Main workspace

The center workspace is split into three tabs: **Conversation**, **Call recap**, and **Post-call notes**.

**Conversation** is where the rep talks to the co-pilot. The rep can ask questions, create follow-ups, save quick notes, or ask about customer context. Voice and text both appear in the conversation stream, and user turns can be edited if transcription gets something wrong.

**Call recap** is the source-of-truth area for what happened on the call. The rep can paste or import a transcript, dictate a quick recap, or type notes manually. This content stays in the Call recap tab and does not get dumped into Conversation as a giant user message. Once a recap exists, Briefly summarizes the key context and suggests a practical next step.

**Post-call notes** is where the recap becomes a structured note. The generated draft is intentionally simple: mood or sentiment, title, summary, key points, and a suggested follow-up. The rep can review and edit the draft before saving. Notes are not auto-saved.

---

## Talking points

Briefly also includes a **Get talking points** action for pre-call prep.

This uses the latest call recap, saved notes, and open tasks to create a short prep card for the next conversation. It gives the rep what to lead with, the customer’s likely concern, a possible objection, a suggested talk track, and a recommended next step.

If Briefly does not have enough context yet, it does not invent talking points. Instead, it prompts the rep to add a call recap first.

---

## Layout

The desktop layout uses one focused workspace with a supporting sidebar.

The center of the screen contains the orb, the main workspace tabs, and the command bar. The right sidebar contains customer context, the action feed, and saved notes. This keeps the app focused on the voice flow without turning it into a CRM dashboard.

On mobile, the layout becomes single-column. The sidebar moves into a sheet, and the command bar becomes a compact sticky composer with voice mode controls, mic, text input, and send.

---

## Voice interaction

Briefly uses the OpenAI Realtime API for live voice.

The intended voice loop is:

```txt
Rep speaks → assistant transcribes → agent uses tools if needed → assistant responds in text and speech
```

The orb is the voice-state indicator. It reflects whether the assistant is idle, listening, thinking, or speaking. The command bar is the control surface for voice and text input.

When the assistant is speaking, the rep can interrupt it from the voice control. The text response remains in the conversation, but the audio stops so the rep can take over.

---

## Why WebRTC

I chose **WebRTC** because this is a browser-based voice product.

WebRTC gives the browser native support for microphone capture, audio playback, echo cancellation, jitter buffering, and low-latency streaming. That makes it a better fit for a live voice co-pilot than manually sending raw audio over WebSockets.

The app mints an ephemeral Realtime client secret from `/api/realtime/session`, so the OpenAI API key stays server-side. The browser then connects directly to OpenAI over WebRTC. Tool events and transcripts travel through the Realtime data channel.

---

## Architecture

```txt
Browser
  ├─ microphone input
  ├─ assistant audio output
  ├─ RTCPeerConnection
  ├─ oai-events data channel
  └─ Zustand client state

Next.js API routes
  ├─ /api/realtime/session
  ├─ /api/customers
  ├─ /api/customers/search
  ├─ /api/customers/[id]
  ├─ /api/customers/[id]/context
  ├─ /api/calls/import
  ├─ /api/notes
  ├─ /api/tasks
  └─ /api/brief

OpenAI Realtime API
  └─ speech in, speech out, model responses, and tool calls
```

Customer data, notes, call recaps, and tasks are backed by a mocked in-memory store. This keeps the prototype focused on the voice experience and agent actions instead of CRM infrastructure.

---

## Implemented tools

Briefly uses mocked backend tools to make the agent actions visible and explainable.

`search_customer` finds a customer by name, company, or partial query. `get_customer_history` retrieves the selected customer’s profile, notes, and open tasks. `get_call_context` retrieves saved transcripts or recaps. `save_call_context` saves imported or dictated call context. `save_note` saves structured post-call notes. `create_task` creates follow-up tasks and parses natural-language due dates. `create_customer` creates and selects a new customer record.

Every tool call appears in the **Actions** tab with its name, arguments, status, and result. This makes the agent’s work visible instead of hidden behind the chat.

---

## Grounding behavior

Briefly is designed to be careful with customer context.

If the user names a customer, Briefly resolves that named customer first. If no customer is named, it uses the selected customer. Customer-specific answers come from the saved customer profile, notes, tasks, and call recaps.

If there is not enough context, Briefly says what is missing instead of making something up. For example, if the user asks for post-call notes without a recap, the agent asks for a transcript or quick recap first.

---

## Demo walkthrough

Start by selecting a seeded customer from the context selector, or create a new customer.

Then open **Call recap** and add call context. You can paste a transcript, dictate a recap, or type rough notes from the call. Briefly keeps that context in the Call recap tab, summarizes it, and suggests a next step.

Next, generate post-call notes. Briefly creates an editable draft with mood, title, summary, key points, and a suggested follow-up. Review the draft, make any edits, and save it. The saved note appears in the Notes sidebar.

Then create a follow-up task by asking the agent, for example: “Remind me to send the proposal next Friday.” The agent creates the task with a parsed due date and confirms it.

Finally, open the **Actions** tab to show the tool calls behind the flow: call context saved, note generated and saved, task created, and any customer lookup that happened along the way.

A second useful demo path is **Get talking points**. Once a customer has call context, click Get talking points to generate a short prep card for the next conversation.

---

## Optional goals covered

Briefly covers the responsive layout goal with desktop and mobile views. It supports real-time voice with speech in and speech out using the OpenAI Realtime API. It includes editable conversation turns for transcription correction. It implements real tool-style integrations through mocked backend routes. It also surfaces the agent’s tool calls through the Actions tab.

I did not use Vercel AI Elements. The interface is built with shadcn/ui and Tailwind CSS, with custom local components for the voice-specific experience.

---

## Known limitations

The prototype uses in-memory persistence, so data resets on server restart or Vercel cold start. Customer data is mocked, and there is no external CRM, calendar, or notes system integration. There is no authentication because this is a single-user prototype.

The app also does not listen to both sides of a real phone call. I interpreted the prompt as a rep-facing voice co-pilot: the rep can interact with the assistant in real time, and call context is provided through imported transcripts, dictated recaps, or typed notes.

In production, notes and tasks would sync to the team’s CRM or task system.

---

## Why this scope

The case study asks for the voice interaction flow and agent actions, not a full CRM. Briefly stays focused on the core workflow:

```txt
Give the agent call context → generate structured notes → create follow-ups → show tool actions
```