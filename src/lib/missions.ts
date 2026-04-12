// Mission definitions — curated investigation scenarios with evidence packs.
//
// Each mission includes:
// - Context cards: news URLs + framing text that ground the player
// - Evidence pack: specific IDs from the jmail DB, tiered by relevance
// - Suggested people/entities to start with
// - Discovery beats: the "aha" moments the mission is designed to deliver

export interface MissionContextCard {
  title: string;
  body: string;
  sourceUrl: string;
  sourceLabel: string;
}

export interface MissionEvidencePack {
  // Core evidence the player should discover
  core: {
    emails: string[];
    photos: string[];
    flights: string[];
    documents: string[];
    videos: string[];
  };
  // Contextual evidence that deepens the investigation
  context: {
    emails: string[];
    photos: string[];
    flights: string[];
    documents: string[];
    videos: string[];
  };
  // Ambiguous evidence — might be related, player decides
  ambiguous: {
    emails: string[];
    photos: string[];
    flights: string[];
    documents: string[];
    videos: string[];
  };
  // Red herrings — noise to filter through
  redHerring: {
    emails: string[];
    photos: string[];
    flights: string[];
    documents: string[];
    videos: string[];
  };
}

export interface Mission {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  difficulty: "introductory" | "intermediate" | "advanced";
  estimatedMinutes: number;
  coverImage?: string; // URL or local path for mission card thumbnail
  contextCards: MissionContextCard[];
  evidencePack: MissionEvidencePack;
  suggestedPeople: string[]; // person IDs from the people table
  suggestedEntities: string[]; // entity IDs from seed data
  discoveryBeats: string[]; // descriptions of key "aha" moments
  // All evidence IDs flattened for quick lookup
  allEvidenceIds: string[];
}

// Helper to flatten a pack into a single array of IDs
function flattenPack(pack: MissionEvidencePack): string[] {
  const ids: string[] = [];
  for (const tier of [pack.core, pack.context, pack.ambiguous, pack.redHerring]) {
    ids.push(...tier.emails, ...tier.photos, ...tier.flights, ...tier.documents, ...tier.videos);
  }
  return ids;
}

// ─── THE AFRICA TRIP (September 2002) ──────────────────────────────────────

const AFRICA_TRIP_PACK: MissionEvidencePack = {
  core: {
    emails: [
      "vol00009-efta00578629-pdf",     // Africa Trip Information — Slade to Maxwell
      "EFTA02334387-0",                 // Updated Plane Manifest (Africa)
      "vol00009-efta00580574-pdf",      // Updated Plane Manifest (Africa) — alt
      "EFTA02334388-0",                 // Updated Africa Plane Manifest — final
    ],
    photos: [
      "EFTA00003177-0.png",  // Clinton + Epstein matching patterned shirts
      "EFTA00003178-0.png",  // Epstein, Clinton, another man at dinner
      "EFTA00003332-0.png",  // Clinton + Spacey walking in park
      "EFTA00003334-0.png",  // Clinton + Spacey in conference room w/ map
      "EFTA00003335-0.png",  // Clinton, Maxwell, Spacey group photo w/ map
      "EFTA00003347-0.png",  // Same group — alt angle
      "EFTA00003191-0.png",  // Airport tarmac, red carpet, officials
      "EFTA00003197-0.png",  // Clinton visiting ornate temple
      "EFTA00003329-0.png",  // Chris Tucker singing with headphones
      "EFTA00003341-0.png",  // Tucker singing — alt angle
      "EFTA00003340-0.png",  // Maxwell in vehicle, African crowd + police
      "EFTA00003342-0.png",  // Clinton shaking hands by SUV
    ],
    flights: [],
    documents: [],
    videos: [],
  },
  context: {
    emails: [
      // Wasserman-Maxwell post-trip emails
      "EFTA02335749-3",                 // Wasserman RE: March 2003
      "EFTA02335749-1",                 // Wasserman "I think of you"
      "vol00009-efta00578813-pdf",      // Wasserman "book that massage"
      "vol00009-efta00578828-pdf",      // Maxwell "continue the massage concept"
      // 2009 Africa trip cost breakdowns
      "EFTA01985765-0",                 // Margaux Rogers — costs
      "EFTA01985766-0",                 // Margaux Rogers — costs alt
      "EFTA02030803-0",                 // FW: costs
      "EFTA02030804-0",                 // Epstein Re: costs
    ],
    photos: [
      "EFTA00001459-0.png",  // Clinton blue dress painting
      "EFTA00003168-0.png",  // Pool — Epstein property
      "EFTA00003170-0.png",  // Hot tub, censored area
      "EFTA00003171-0.png",  // Maxwell + Epstein seated
      "EFTA00003330-0.png",  // Clinton, arm around redacted person
      "EFTA00003364-0.png",  // Clinton with redacted woman
      "EFTA00003365-0.png",  // Clinton with pilots
      "EFTA00003381-0.png",  // Clinton, Epstein, Jean-Luc Brunel
    ],
    flights: [],
    documents: [],
    videos: [],
  },
  ambiguous: {
    emails: [
      "EFTA02334725-1",                 // G. Max "sending again my schedule" Sept 9
      "vol00009-efta00578526-pdf",      // Dr E. Maxwell schedule Sept 8
      "EFTA02334386-0",                 // David Slade "Updated Plane Manifest" Sept 11
    ],
    photos: [
      "EFTA00003193-0.png",  // Maxwell + man at temple
      "EFTA00003195-0.png",  // Maxwell + man in decorated room
      "EFTA00003175-0.png",  // Maxwell with camera in ornate room
      "EFTA00003328-0.png",  // Maxwell in vehicle, people gazing in
      "EFTA00003323-0.png",  // Woman + two men in historic building
      "EFTA00003349-0.png",  // Dining scene
      "EFTA00003350-0.png",  // Tucker at table, different setting
      "EFTA00003367-0.png",  // Michael Jackson, Clinton, Diana Ross
      "EFTA00003380-0.png",  // Mick Jagger + Clinton
    ],
    flights: [],
    documents: [],
    videos: [],
  },
  redHerring: {
    emails: [
      "EFTA02332299-1",                 // "DON'T BREAK IT UNTIL SEPTEMBER 11"
      "EFTA02332405-0",                 // Ian Maxwell "Wakey! wakey!"
      "EFTA02334450-0",                 // McAfee VirusScan spam
      "EFTA02334404-0",                 // US Airways E-Savers
      "vol00009-efta00579733-pdf",      // DailyCandy "I Love New York"
      "vol00009-efta00580572-pdf",      // Colin Cowie Show
    ],
    photos: [
      "EFTA00003208-0.png",  // Maxwell dressing dog in coat
      "EFTA00003211-0.png",  // Maxwell in fur coat at night
      "EFTA00003215-0.png",  // Maxwell + Epstein on Segway
    ],
    flights: [],
    documents: [],
    videos: [],
  },
};

export const AFRICA_TRIP_MISSION: Mission = {
  id: "africa-trip-2002",
  title: "The Africa Trip",
  subtitle: "September 2002 · Clinton · Epstein · Spacey",
  description:
    "A former president, a convicted sex trafficker, and a disgraced actor flew across Africa on a private Boeing 727. Investigate the nine-day trip that would become one of the most scrutinized journeys in modern history.",
  difficulty: "introductory",
  estimatedMinutes: 30,
  contextCards: [
    {
      title: "The Trip",
      body: "In September 2002, former President Bill Clinton embarked on a 9-day humanitarian trip across Africa, visiting HIV/AIDS project sites in Ghana, Nigeria, Rwanda, Mozambique, and South Africa. He flew on a private Boeing 727 owned by financier Jeffrey Epstein.",
      sourceUrl: "https://en.wikipedia.org/wiki/Relationship_of_Bill_Clinton_and_Jeffrey_Epstein",
      sourceLabel: "Wikipedia",
    },
    {
      title: "The Passengers",
      body: "The plane carried actors Kevin Spacey and Chris Tucker, Epstein's companion Ghislaine Maxwell, Clinton aide Doug Band, LA mogul Casey Wasserman, and several unidentified young women described by an FBI physician as 'a masseuse, a model, and a ballerina.'",
      sourceUrl: "https://www.newsweek.com/kevin-spacey-admits-flying-jeffery-epstien-bill-clinton-1911631",
      sourceLabel: "Newsweek",
    },
    {
      title: "No Secret Service?",
      body: "Clinton claimed Secret Service agents accompanied him on all legs. But the flight manifests list no agents — and the Secret Service refused to confirm their presence on the 2002 Africa trip.",
      sourceUrl: "https://www.washingtonexaminer.com/news/2032841/flight-manifests-reveal-bill-clinton-traveled-with-epstein-six-times-not-the-four-times-he-admitted/",
      sourceLabel: "Washington Examiner",
    },
    {
      title: "Years Later",
      body: "In 2024, Kevin Spacey admitted there were 'young girls' on the flight. He said he had 'no idea who Epstein was' when he boarded. Clinton's office maintains he 'knows nothing about the terrible crimes.'",
      sourceUrl: "https://www.yahoo.com/entertainment/kevin-spacey-admits-flying-jeffrey-133301996.html",
      sourceLabel: "Yahoo News",
    },
  ],
  evidencePack: AFRICA_TRIP_PACK,
  suggestedPeople: [
    "jeffrey-epstein",
    "ghislaine-maxwell",
    "bill-clinton",
    "kevin-spacey",
    "chris-tucker",
  ],
  suggestedEntities: [],
  discoveryBeats: [
    "Ghislaine Maxwell was the logistics coordinator — David Slade sent trip plans TO her",
    "Dan Rather and CBS News wanted to fly on Epstein's private jet",
    "No Secret Service agents appear on the flight manifests",
    "Four unidentified young women aged 20-22 — names redacted from FBI notes",
    "Casey Wasserman's post-trip emails to Maxwell turned sexual within months",
    "Clinton and Epstein wore matching patterned shirts — the level of comfort",
    "The Clinton painting in a blue dress found at Epstein's property",
    "2009 cost breakdowns show Africa trips continued for years",
  ],
  allEvidenceIds: flattenPack(AFRICA_TRIP_PACK),
};

// ─── Mission Registry ──────────────────────────────────────────────────────

export const MISSIONS: Mission[] = [AFRICA_TRIP_MISSION];

export function getMissionById(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}
