# Briefly

Briefly is a voice-first sales co-pilot for turning call context into clear post-call notes, follow-ups, and next-step guidance.

The app is intentionally focused on one reviewer-ready flow:

```txt
Select or create customer -> add call recap -> generate post-call notes -> save note -> create follow-up -> inspect Actions
```

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS v4
- shadcn/ui-style local components
- Zustand
- React Query
- Motion
- OpenAI Realtime API over WebRTC

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000.

Add `OPENAI_API_KEY` to `.env.local` for live Realtime voice and audio transcription. Without a key, the app still supports the product flow through local demo behavior, mocked backend routes, and the text command bar.

Production check:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm start
```

## Core Flow

1. Select a seeded customer from the context chip, or create a new customer.
2. Open **Call recap** and add context by importing a transcript, dictating a recap, uploading audio, or typing rough notes.
3. Click **Generate post-call notes**.
4. Review and edit the generated note draft, then save it.
5. Create a follow-up by asking the agent or using a suggested follow-up.
6. Open **Actions** to inspect every tool call, arguments, status, and result.

## Workspace

The center workspace has three tabs:

- **Conversation:** live agent interaction, transcript turns, editable user messages, and generated talking points.
- **Call recap:** the source-of-truth call context area. Recaps stay here instead of being dumped into the conversation.
- **Post-call notes:** editable structured note draft with mood, title, summary, key points, and suggested follow-ups.

The right sidebar has three main reviewer surfaces:

- **Customer:** selected customer details, open tasks, notes preview, and saved call context.
- **Actions:** visible tool calls for customer search, context retrieval, note saves, task creation, and call context saves.
- **Notes:** saved notes with edit support.

On mobile, the sidebar moves into a sheet and the composer becomes a compact two-row control with voice mode, mic, text input, and send.

## Voice Behavior

Briefly uses `/api/realtime/session` to mint an ephemeral Realtime client secret. The browser then connects directly to OpenAI over WebRTC, with the API key kept server-side.

Voice output is constrained to a single assistant voice. Browser speech synthesis is only used for demo mode or text-only fallback responses, so Realtime audio does not double-speak. While the assistant is speaking, the mic control interrupts the current response and stops audio playback.

## API Routes

| Route | Purpose |
|---|---|
| `/api/realtime/session` | Mint ephemeral Realtime token |
| `/api/customers` | List or create customers |
| `/api/customers/search` | Fuzzy customer search |
| `/api/customers/[id]` | Customer profile, notes, and tasks |
| `/api/customers/[id]/context` | Saved call recaps and transcripts |
| `/api/calls/import` | Save pasted/imported call context |
| `/api/calls/transcribe` | Transcribe uploaded audio |
| `/api/note-draft` | Generate structured post-call note draft |
| `/api/notes` | Save or update notes |
| `/api/tasks` | Create or update follow-up tasks |
| `/api/brief` | Generate pre-call talking points |

## Data Model

The prototype uses an in-memory store seeded with sample customers. Notes, tasks, and call recaps reset when the server restarts or a Vercel deployment cold starts.

This keeps the submission focused on the voice workflow and agent actions rather than CRM persistence, authentication, calendar integration, or multi-user permissions.

## Demo Script

1. Pick a customer in the top context chip.
2. Go to **Call recap** and paste this sample:

```txt
Rep: What is the biggest blocker right now?
Customer: Reporting is scattered and finance needs proof before approving.
Rep: What timeline are you aiming for?
Customer: If the proposal is clear, we can review it next week.
Rep: I will send a proposal and ROI summary.
```

3. Save the recap.
4. Generate post-call notes, edit a line, and save.
5. Ask: `Remind me to send the proposal next Friday`.
6. Open **Actions** and inspect the tool calls.
7. Click **Get talking points** to generate a concise prep card from the saved context.
