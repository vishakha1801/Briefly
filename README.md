# Briefly

Briefly is a voice-first sales co-pilot for turning call context into clear post-call notes, follow-ups, and next-step guidance.

The app is intentionally focused on one reviewer-ready flow:

```txt
Select or create customer -> add call recap -> generate post-call notes -> save note -> create follow-up -> inspect Actions
```

## 🪼 Design Decisions 

I did not want Briefly to feel like another generic ChatGPT-wrapper dashboard. As a design engineer, I believe every interaction—from where context lives to when the agent speaks—should feel highly intentional. ✦

### 🍋‍🟩 Keeping the Conversation Clean 
Instead of dumping messy, multi-paragraph call transcripts directly into the chat timeline, I created a dedicated **Call recap** tab. It keeps the primary co-pilot chat focused and readable, acting as a clean workspace while the agent references the recap in the background as raw source material. 

Similarly, **Talking points** are not just a random chat gimmick; they are structured as high-density pre-call prep cards. Grabbing talking points is a deliberate action before your next customer meeting, cleanly synthesizing previous call summaries, stored notes, and open tasks.

### 🐦‍🔥 Trust, Correction, and Voice Affordances 🌙
Voice is inherently messy, so I designed Briefly to support human correction:
- **Editable transcripts**: Reps can instantly edit previous messages or speech transcripts to correct what the system heard, triggering a fresh turn and assistant response.
- **Microphone affordances**: Briefly supports **Push-to-talk** (for quick, non-disruptive lookups while you're on a call) and **Hands-free** (for continuous voice-first co-piloting). 
- **Active Interruptions**: If the co-pilot talks too much, you can tap the mic to interrupt and stop it mid-sentence. It's a true voice-product affordance, not just a static playback bar.
- **The Voice Orb**: The central orb is more than pretty motion design. It communicates current voice states in real-time: idle, listening, thinking, and speaking.

### ✨ Under the Hood Polish
- **Fuzzy Customer Search**: Customer lookup supports fuzzy spelling checks, meaning the co-pilot will still pull up the right profile even if you slightly mispronounce or misremember a customer's name.
- **Graceful Fallbacks**: If there isn't enough call context to generate notes or talking points, the app doesn't crash or throw a dead error; instead, it dynamically guides you with friendly action links to record, import, or write context.
- **WebRTC for Voice**: Direct WebRTC streaming over the OpenAI Realtime API gives Briefly ultra-low-latency audio streaming, echo cancellation, and highly natural conversational rhythms.
- **Slick Visuals & Layouts**: I designed a distinct glassmorphic visual system with soft pastels, blurs, and premium dark/light cards that feel vastly superior to a default shadcn layout. Desktop and mobile are treated as distinct layouts—never just squeezed versions of the same screen.

## Tech Stack

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


## Core Flow
1. Select a seeded customer from the context dropdown, or create a new customer.
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



## Demo Script
1. Pick a customer in the top context dropdown.
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
