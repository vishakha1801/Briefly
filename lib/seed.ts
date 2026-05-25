import type { CallContext, Customer } from "./types";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();
const dueIn = (days: number) =>
  new Date(now + days * day).toISOString().slice(0, 10);

export function buildSeed(): Customer[] {
  return [
    {
      id: "cus_maya",
      name: "Maya Chen",
      company: "Northwind Robotics",
      email: "maya.chen@northwind.io",
      phone: "+1 (415) 555-0142",
      stage: "Discovery",
      lastContact: iso(2),
      createdAt: iso(40),
      notes: [
        {
          id: "note_maya_1",
          customerId: "cus_maya",
          createdAt: iso(8),
          headline: "Intro call — exploring fleet automation",
          body: "Maya runs ops for a 60-robot warehouse fleet. Biggest pain is manual scheduling — her team spends ~15 hours/week on it. Curious but guarded on price; explicitly asked for ROI math before looping in her VP.",
          source: "manual",
        },
        {
          id: "note_maya_2",
          customerId: "cus_maya",
          createdAt: iso(2),
          headline: "Follow-up — ROI + onboarding",
          body: "Walked through the 3-month payback model. She liked the fast onboarding (live in 2 weeks). Wants a one-pager to forward to finance and a short call with their VP Ops next week. Champion-level interest.",
          source: "manual",
        },
      ],
      tasks: [
        {
          id: "task_maya_1",
          customerId: "cus_maya",
          title: "Send ROI one-pager to finance",
          dueDate: dueIn(2),
          priority: "high",
          done: false,
          createdAt: iso(2),
          source: "manual",
        },
        {
          id: "task_maya_2",
          customerId: "cus_maya",
          title: "Email intro deck",
          priority: "med",
          done: true,
          createdAt: iso(8),
          source: "manual",
        },
      ],
    },
    {
      id: "cus_diego",
      name: "Diego Alvarez",
      company: "Helios Freight",
      email: "diego@heliosfreight.com",
      phone: "+1 (312) 555-0188",
      stage: "Negotiation",
      lastContact: iso(1),
      createdAt: iso(70),
      notes: [
        {
          id: "note_diego_1",
          customerId: "cus_diego",
          createdAt: iso(10),
          headline: "Pricing pushback",
          body: "Loves the product, balking at the per-seat model. Wants a volume discount above 200 seats. Comparing us against an in-house build.",
          source: "manual",
        },
        {
          id: "note_diego_2",
          customerId: "cus_diego",
          createdAt: iso(1),
          headline: "Legal review started",
          body: "Their legal flagged the data-retention clause. Needs our DPA and a redlined MSA. Procurement wants a 2-year term for a better rate.",
          source: "manual",
        },
      ],
      tasks: [
        {
          id: "task_diego_1",
          customerId: "cus_diego",
          title: "Send DPA + redlined MSA",
          dueDate: dueIn(1),
          priority: "high",
          done: false,
          createdAt: iso(1),
          source: "manual",
        },
        {
          id: "task_diego_2",
          customerId: "cus_diego",
          title: "Loop in solutions eng for volume pricing",
          dueDate: dueIn(3),
          priority: "med",
          done: false,
          createdAt: iso(1),
          source: "manual",
        },
        {
          id: "task_diego_3",
          customerId: "cus_diego",
          title: "Share security whitepaper",
          priority: "low",
          done: true,
          createdAt: iso(9),
          source: "manual",
        },
      ],
    },
    {
      id: "cus_priya",
      name: "Priya Raman",
      company: "Lumen Health",
      email: "priya.raman@lumenhealth.org",
      phone: "+1 (617) 555-0117",
      stage: "Closed Won",
      lastContact: iso(6),
      createdAt: iso(120),
      notes: [
        {
          id: "note_priya_1",
          customerId: "cus_priya",
          createdAt: iso(6),
          headline: "Signed — 150 seats",
          body: "Closed at 150 seats, annual. Champion (Priya) is excited. Watch for expansion into their billing team in Q3. Wants a quarterly business review cadence.",
          source: "manual",
        },
      ],
      tasks: [
        {
          id: "task_priya_1",
          customerId: "cus_priya",
          title: "Schedule onboarding kickoff",
          dueDate: dueIn(4),
          priority: "med",
          done: false,
          createdAt: iso(6),
          source: "manual",
        },
      ],
    },
    {
      id: "cus_tariq",
      name: "Tariq Bello",
      company: "Cobalt Studios",
      email: "tariq@cobaltstudios.tv",
      phone: "+1 (213) 555-0199",
      stage: "Qualification",
      lastContact: iso(4),
      createdAt: iso(25),
      notes: [
        {
          id: "note_tariq_1",
          customerId: "cus_tariq",
          createdAt: iso(4),
          headline: "Budget owner unclear",
          body: "Creative agency, 40 people. Tariq is excited but isn't the economic buyer — need to find who owns the budget. No transcript yet; only an intro email exchange.",
          source: "manual",
        },
      ],
      tasks: [
        {
          id: "task_tariq_1",
          customerId: "cus_tariq",
          title: "Identify the economic buyer",
          dueDate: dueIn(3),
          priority: "med",
          done: false,
          createdAt: iso(4),
          source: "manual",
        },
      ],
    },
    {
      id: "cus_hana",
      name: "Hana Suzuki",
      company: "Meridian Analytics",
      email: "h.suzuki@meridian.ai",
      phone: "+1 (206) 555-0153",
      stage: "Proposal",
      lastContact: iso(3),
      createdAt: iso(55),
      notes: [
        {
          id: "note_hana_1",
          customerId: "cus_hana",
          createdAt: iso(8),
          headline: "Security review",
          body: "Data team is technical and detail-oriented. Wants SOC 2 Type II and SSO before they sign. Evaluating two vendors.",
          source: "manual",
        },
        {
          id: "note_hana_2",
          customerId: "cus_hana",
          createdAt: iso(3),
          headline: "Proposal sent — tight timeline",
          body: "Sent proposal for 80 seats. Timeline is tight: she wants a decision within two weeks ahead of a board update. SSO is the gating item.",
          source: "manual",
        },
      ],
      tasks: [
        {
          id: "task_hana_1",
          customerId: "cus_hana",
          title: "Share SOC 2 Type II report",
          dueDate: dueIn(1),
          priority: "high",
          done: false,
          createdAt: iso(3),
          source: "manual",
        },
      ],
    },
    {
      id: "cus_omar",
      name: "Omar Haddad",
      company: "Vertex Logistics",
      email: "omar.haddad@vertexlog.com",
      phone: "+1 (469) 555-0124",
      stage: "Discovery",
      lastContact: iso(9),
      createdAt: iso(18),
      notes: [],
      tasks: [
        {
          id: "task_omar_1",
          customerId: "cus_omar",
          title: "Book technical discovery call",
          dueDate: dueIn(5),
          priority: "low",
          done: false,
          createdAt: iso(9),
          source: "manual",
        },
      ],
    },
    {
      id: "cus_lena",
      name: "Lena Fischer",
      company: "Aurora Energy",
      email: "lena.fischer@auroraenergy.eu",
      phone: "+49 30 555 0166",
      stage: "Negotiation",
      lastContact: iso(5),
      createdAt: iso(90),
      notes: [
        {
          id: "note_lena_1",
          customerId: "cus_lena",
          createdAt: iso(5),
          headline: "Procurement gating",
          body: "Verbal yes from the team. Now stuck in procurement. Wants a 3-year deal for a better rate. Renewal budget unlocks next quarter.",
          source: "manual",
        },
      ],
      tasks: [
        {
          id: "task_lena_1",
          customerId: "cus_lena",
          title: "Draft 3-year pricing scenario",
          dueDate: dueIn(2),
          priority: "high",
          done: false,
          createdAt: iso(5),
          source: "manual",
        },
      ],
    },
    {
      id: "cus_sam",
      name: "Sam Okoro",
      company: "Drift Mobile",
      email: "sam@driftmobile.app",
      phone: "+1 (737) 555-0171",
      stage: "Closed Lost",
      lastContact: iso(30),
      createdAt: iso(110),
      notes: [
        {
          id: "note_sam_1",
          customerId: "cus_sam",
          createdAt: iso(30),
          headline: "Lost to budget freeze",
          body: "Great fit but a company-wide hiring & spend freeze killed it. Worth re-engaging next fiscal year — Sam asked us to check back in Q1.",
          source: "manual",
        },
      ],
      tasks: [
        {
          id: "task_sam_1",
          customerId: "cus_sam",
          title: "Re-engage next quarter",
          dueDate: dueIn(60),
          priority: "low",
          done: false,
          createdAt: iso(30),
          source: "manual",
        },
      ],
    },
  ];
}

/**
 * Seeded call transcripts for a subset of customers, so the "summarize the
 * call" and Deal Brief flows have real content — while others (Tariq, Omar,
 * Lena, Sam) have none, to demo the "import a transcript first" path.
 */
export function buildSeedCallContexts(): Map<string, CallContext[]> {
  const m = new Map<string, CallContext[]>();
  const ctx = (
    id: string,
    customerId: string,
    title: string,
    daysAgo: number,
    participants: string,
    transcript: string
  ): CallContext => ({
    id,
    customerId,
    title,
    transcript,
    participants,
    callDate: iso(daysAgo).slice(0, 10),
    createdAt: iso(daysAgo),
  });

  m.set("cus_maya", [
    ctx(
      "call_maya_1",
      "cus_maya",
      "Discovery call — fleet automation",
      8,
      "Rep, Maya Chen (VP Ops)",
      "Rep: Thanks for the time, Maya. Where does scheduling hurt most today? " +
        "Maya: Honestly it's all manual — my team burns about fifteen hours a week juggling sixty robots across shifts. " +
        "Rep: And if that were automated? Maya: We'd redeploy those hours to throughput. But I have to warn you, we're price sensitive — I can't take a big number to my VP without ROI. " +
        "Rep: Totally fair. If I show payback inside a quarter, does that move it forward? Maya: If finance sees a three-month payback, yes. Send me something I can forward."
    ),
  ]);

  m.set("cus_diego", [
    ctx(
      "call_diego_1",
      "cus_diego",
      "Negotiation — pricing & legal",
      2,
      "Rep, Diego Alvarez (Dir. Procurement)",
      "Diego: The product's great, but the per-seat pricing doesn't work past two hundred seats. " +
        "Rep: We can do volume tiers — what seat count are you planning for? Diego: Two-fifty to start, maybe four hundred by year two. " +
        "Rep: That qualifies for our volume rate. Diego: Good. The other blocker is legal — they flagged data retention and want our DPA. And procurement wants a two-year term for a better number. " +
        "Rep: I'll send the DPA and a redlined MSA today, and a two-year scenario. Diego: Do that and we can move."
    ),
  ]);

  m.set("cus_hana", [
    ctx(
      "call_hana_1",
      "cus_hana",
      "Security review call",
      8,
      "Rep, Hana Suzuki (Head of Data), Security analyst",
      "Hana: Before anything else — we need SOC 2 Type Two and SSO. Without SSO we can't roll this out. " +
        "Rep: We're SOC 2 Type Two; I'll share the report. SSO via SAML is standard on your tier. " +
        "Hana: Good. Timeline matters — I have a board update in two weeks and want a decision before then. " +
        "Rep: Then let's get the proposal and security pack to you this week. Hana: Please. SSO is the gating item for me."
    ),
  ]);

  m.set("cus_priya", [
    ctx(
      "call_priya_1",
      "cus_priya",
      "Closing call — 150 seats",
      6,
      "Rep, Priya Raman (Champion)",
      "Priya: The team's aligned — we're ready to move on a hundred and fifty seats, annual. " +
        "Rep: Fantastic. Anything outstanding? Priya: Just onboarding — I want a kickoff scheduled fast, and a quarterly review cadence. " +
        "Rep: Done. And there may be a billing-team expansion in Q3? Priya: Likely. Let's land this first, then talk expansion."
    ),
  ]);

  return m;
}
