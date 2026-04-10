// src/lib/entity-seed-data.ts
//
// Seed dataset for non-person entities: places, organizations, events.
// Sourced from established journalism and court records (see opencase_design_doc.md).
//
// IMAGE SOURCING MODEL
// --------------------
// Each entity specifies ONE of the following image strategies:
//
//   { strategy: "wikipedia", article: "Little_Saint_James" }
//     -> Fetch the page-lead thumbnail at seed time from the Wikipedia REST API:
//        https://en.wikipedia.org/api/rest_v1/page/summary/{article}
//        Use the `thumbnail.source` (or `originalimage.source`) URL.
//        Download once and cache in /public/entity-images/{entity_id}.jpg.
//
//   { strategy: "wikimedia_file", file: "Little_Saint_James.png" }
//     -> Fetch a specific Wikimedia Commons file via the same thumbnail pipeline:
//        https://commons.wikimedia.org/wiki/Special:FilePath/{file}?width=800
//        Download once and cache locally.
//
//   { strategy: "none" }
//     -> No image available in the public record. Render as a "stylized card"
//        per the design doc: a corkboard-style card with no photo, using the
//        entity type's visual language (see entity-card-rendering.md).
//
// All images must be fetched ONCE at seed time by a one-off script
// (scripts/fetch-entity-images.ts), not on every render. Hotlinking
// Wikipedia images from the client is prohibited by Wikimedia policy.

export type EntityType = "place" | "organization" | "event";

export type EntityImageStrategy =
  | { strategy: "wikipedia"; article: string }
  | { strategy: "wikimedia_file"; file: string }
  | { strategy: "none" };

export interface SeedEntity {
  id: string;               // stable slug, matches source catalog (e.g. "place-01")
  type: EntityType;
  name: string;
  shortName?: string;       // optional display name for tight UI (card label)
  description: string;      // 1–3 sentence summary for card details view
  dateRange?: string;       // human-readable; required for events, optional otherwise
  location?: string;        // human-readable
  keyPeople: string[];      // names only; matched to person entities at runtime
  image: EntityImageStrategy;
  sources: string[];        // short labels, not full citations (details view only)
}

// =============================================================================
// PLACES
// =============================================================================

export const PLACES: SeedEntity[] = [
  {
    id: "place-01",
    type: "place",
    name: "Little Saint James Island",
    shortName: "Little Saint James",
    description:
      "A 71.5-acre private island in the U.S. Virgin Islands that served as Epstein's primary residence after 2010. Federal prosecutors identified it as a central location in his sex-trafficking operation. Features a main residence, guest houses, and the distinctive blue-and-white striped structure that became a widely-reproduced landmark image.",
    dateRange: "Purchased 1998; sold 2023",
    location: "U.S. Virgin Islands, south of St. Thomas",
    keyPeople: [
      "Jeffrey Epstein",
      "Ghislaine Maxwell",
      "Sarah Kellen",
      "Nadia Marcinkova",
      "Jean-Luc Brunel",
      "Prince Andrew, Duke of York",
    ],
    image: { strategy: "wikipedia", article: "Little_Saint_James" },
    sources: [
      "Government of USVI v. Estate of Jeffrey Epstein (Case No. ST-20-CV-014)",
      "Julie K. Brown, 'Perversion of Justice,' Miami Herald (2018)",
      "U.S. v. Epstein Indictment, No. 1:19-cr-00490 (S.D.N.Y. 2019)",
    ],
  },
  {
    id: "place-02",
    type: "place",
    name: "9 East 71st Street (Herbert N. Straus House)",
    shortName: "Manhattan Townhouse",
    description:
      "A seven-story, 21,000-square-foot Beaux-Arts townhouse on Manhattan's Upper East Side that was Epstein's primary New York residence. FBI agents raided the property on July 8, 2019 and discovered photographs federal prosecutors described as appearing to depict nude minors. Explicitly referenced in the 2019 federal indictment as a location where criminal acts occurred.",
    dateRange: "Transferred to Epstein c. 1995–1998; sold 2021 for $51M",
    location: "Upper East Side, Manhattan, New York City",
    keyPeople: [
      "Jeffrey Epstein",
      "Leslie Wexner",
      "Ghislaine Maxwell",
      "Darren Indyke",
      "Richard Kahn",
    ],
    image: { strategy: "wikipedia", article: "Herbert_N._Straus_House" },
    sources: [
      "U.S. v. Epstein Indictment (S.D.N.Y. 2019)",
      "Wikipedia, 'Properties of Jeffrey Epstein'",
      "DOJ Office of Professional Responsibility Report (2020)",
    ],
  },
  {
    id: "place-03",
    type: "place",
    name: "358 El Brillo Way (Palm Beach Estate)",
    shortName: "Palm Beach Estate",
    description:
      "Epstein's 14,000-square-foot waterfront mansion in Palm Beach, Florida. Prosecutors identified it as the primary location where the abuse documented in the 2008 Florida case occurred. The Palm Beach Police investigation began here in 2005 and identified at least 36 girls between ages 14 and 17 with similar accounts. Sold 2021 and subsequently demolished.",
    dateRange: "Purchased 1990; sold and demolished 2021–2022",
    location: "358 El Brillo Way, Palm Beach, Florida",
    keyPeople: [
      "Jeffrey Epstein",
      "Ghislaine Maxwell",
      "Sarah Kellen",
      "Michael Reiter",
      "Alexander Acosta",
    ],
    image: { strategy: "wikipedia", article: "Properties_of_Jeffrey_Epstein" },
    sources: [
      "DOJ Office of Professional Responsibility Report (2020)",
      "Julie K. Brown, 'Perversion of Justice,' Miami Herald (2018)",
      "NPR, Epstein timeline (updated 2025)",
    ],
  },
  {
    id: "place-04",
    type: "place",
    name: "Zorro Ranch",
    description:
      "A sprawling property of more than 7,500 acres near Stanley, New Mexico, where Epstein built a 33,000-square-foot hacienda he described as making his Manhattan townhouse 'look like a shack.' The ranch included an airplane hangar and landing strip. Multiple accusers have described abuse occurring at the ranch.",
    dateRange: "Purchased 1993; sold 2023",
    location: "Near Stanley, Santa Fe County, New Mexico",
    keyPeople: ["Jeffrey Epstein", "Ghislaine Maxwell"],
    image: { strategy: "wikipedia", article: "Zorro_Ranch" },
    sources: [
      "Wikipedia, 'Properties of Jeffrey Epstein'",
      "Julie K. Brown, 'Perversion of Justice' (book, 2021)",
      "Newsweek property reporting (2026)",
    ],
  },
  {
    id: "place-05",
    type: "place",
    name: "Great Saint James Island",
    description:
      "A 165-acre island adjacent to Little Saint James, purchased by Epstein in 2016. Epstein began construction of a new compound but was issued a stop-work order by Virgin Islands authorities for environmental violations. Named as part of the U.S. Virgin Islands civil RICO suit.",
    dateRange: "Purchased 2016; sold 2023 (with Little Saint James, $60M total)",
    location: "U.S. Virgin Islands, adjacent to Little Saint James",
    keyPeople: ["Jeffrey Epstein", "Darren Indyke", "Richard Kahn"],
    image: { strategy: "wikipedia", article: "Great_Saint_James_Island" },
    sources: [
      "Government of USVI v. Estate of Jeffrey Epstein (Case No. ST-20-CV-014)",
      "ABC News property sale reporting (2022)",
      "Wikipedia, 'Properties of Jeffrey Epstein'",
    ],
  },
  {
    id: "place-06",
    type: "place",
    name: "22 Avenue Foch (Paris Apartment)",
    shortName: "Paris Apartment",
    description:
      "Epstein's 685-square-meter apartment in Paris's exclusive 16th arrondissement, on one of the city's most prestigious avenues. Epstein was returning from this property when he was arrested at Teterboro Airport on July 6, 2019. Sold in 2022 to a Bulgarian tycoon for approximately $10.4 million.",
    dateRange: "Sold 2022",
    location: "22 Avenue Foch, 16th arrondissement, Paris, France",
    keyPeople: ["Jeffrey Epstein", "Ghislaine Maxwell", "Jean-Luc Brunel"],
    image: { strategy: "wikipedia", article: "Avenue_Foch" },
    sources: [
      "Wikipedia, 'Properties of Jeffrey Epstein'",
      "Flight logs from Giuffre v. Maxwell, No. 15-cv-07433",
      "NPR Epstein timeline (2025)",
    ],
  },
  {
    id: "place-07",
    type: "place",
    name: "Palm Beach County Stockade",
    shortName: "Palm Beach Jail",
    description:
      "The Palm Beach County jail facility where Epstein served his 2008 sentence under a highly controversial work-release arrangement. Epstein was permitted to leave six days a week for up to 12–16 hours per day, transported by a private driver to an office in West Palm Beach. The arrangement became central to allegations that he received preferential treatment.",
    dateRange: "Sentence served July 2008 – July 2009",
    location: "Palm Beach County, Florida",
    keyPeople: [
      "Jeffrey Epstein",
      "Alexander Acosta",
      "Barry Krischer",
      "Ric Bradshaw",
    ],
    image: { strategy: "none" },
    sources: [
      "DOJ Office of Professional Responsibility Report (2020)",
      "Julie K. Brown, 'Perversion of Justice,' Miami Herald (2018)",
      "NPR Epstein timeline (2025)",
    ],
  },
  {
    id: "place-08",
    type: "place",
    name: "Metropolitan Correctional Center (MCC), New York",
    shortName: "MCC New York",
    description:
      "The federal detention facility in Lower Manhattan where Epstein was held following his July 2019 arrest, and where he died on August 10, 2019. Death was ruled a suicide by hanging; accompanied by significant failures of jail protocols including guards failing to check on him and non-functional surveillance cameras.",
    dateRange: "Epstein held July 6 – August 10, 2019",
    location: "150 Park Row, Lower Manhattan, New York City",
    keyPeople: ["Jeffrey Epstein", "Tova Noel", "Michael Thomas"],
    image: {
      strategy: "wikipedia",
      article: "Metropolitan_Correctional_Center,_New_York",
    },
    sources: [
      "DOJ Office of Inspector General Report on MCC failures (2021)",
      "U.S. v. Noel, No. 1:19-cr-00830 (S.D.N.Y. 2019)",
      "PBS NewsHour timeline (2026)",
    ],
  },
  {
    id: "place-09",
    type: "place",
    name: "The Dalton School",
    description:
      "An elite private K-12 school on Manhattan's Upper East Side where Epstein taught physics and mathematics in the mid-1970s despite not holding a college degree. His position there is how he first became connected to the world of wealthy families, including reportedly being introduced to Bear Stearns through the father of one of his students.",
    dateRange: "Epstein taught approximately 1974–1976",
    location: "108 East 89th Street, Upper East Side, Manhattan",
    keyPeople: ["Jeffrey Epstein", "Donald Barr", "Ace Greenberg"],
    image: { strategy: "wikipedia", article: "Dalton_School" },
    sources: [
      "Wikipedia, 'Jeffrey Epstein'",
      "Vicky Ward, 'The Talented Mr. Epstein,' Vanity Fair (2003)",
      "New York Times biographical coverage (2019)",
    ],
  },
  {
    id: "place-10",
    type: "place",
    name: "Teterboro Airport",
    description:
      "A general aviation airport in Bergen County, New Jersey, where federal agents arrested Epstein on July 6, 2019 as he landed on his private jet returning from Paris. The arrest location is documented in federal court filings and has significance as the entry point triggering the 2019 federal indictment. Also a frequent departure and arrival point for Epstein's aircraft over many years.",
    dateRange: "Arrest: July 6, 2019",
    location: "Teterboro, Bergen County, New Jersey",
    keyPeople: ["Jeffrey Epstein"],
    image: { strategy: "wikipedia", article: "Teterboro_Airport" },
    sources: [
      "U.S. v. Epstein Indictment, No. 1:19-cr-00490 (S.D.N.Y. 2019)",
      "Flight log records from Giuffre v. Maxwell",
      "CBS New York Epstein timeline (2019)",
    ],
  },
];

// =============================================================================
// ORGANIZATIONS
// =============================================================================
// Note: nearly all Epstein-related organizations are shell companies with no
// canonical public imagery. They render as stylized cards per the design doc
// ("logos, letterhead, or stylized cards depending on available imagery").
// The exceptions are MC2 Model Management and the 1953 Trust's parent context.

export const ORGANIZATIONS: SeedEntity[] = [
  {
    id: "org-01",
    type: "organization",
    name: "Financial Trust Company, Inc.",
    shortName: "Financial Trust Co.",
    description:
      "One of Epstein's primary corporate vehicles, registered in the U.S. Virgin Islands. Functioned as the formal entity through which much of his financial management business was conducted. Named as a party in multiple court proceedings and listed among the Epstein Enterprise entities in the USVI's RICO suit against JPMorgan Chase.",
    dateRange: "Active late 1990s – 2019+",
    location: "U.S. Virgin Islands (registered)",
    keyPeople: ["Jeffrey Epstein", "Darren Indyke", "Richard Kahn"],
    image: { strategy: "none" },
    sources: [
      "Financial Trust Co. v. Citibank, 268 F. Supp. 2d 561 (D.V.I. 2003)",
      "Government of USVI v. JPMorgan Chase (2022)",
      "USVI Superior Court subpoena records (Case No. ST-20-CV-014)",
    ],
  },
  {
    id: "org-02",
    type: "organization",
    name: "Southern Trust Company",
    description:
      "One of two financial trust entities Epstein created alongside Financial Trust Company, presented as legitimate financial management firms. Named in the U.S. Virgin Islands' civil RICO lawsuit and in JPMorgan Chase litigation as part of the 'Epstein Enterprise' — the association of companies that prosecutors allege facilitated and concealed the trafficking operation.",
    location: "U.S. Virgin Islands (registered)",
    keyPeople: ["Jeffrey Epstein", "Darren Indyke", "Richard Kahn"],
    image: { strategy: "none" },
    sources: [
      "Government of USVI v. Estate of Jeffrey Epstein (Case No. ST-20-CV-014)",
      "U.S. Virgin Islands v. JPMorgan Chase (2022)",
      "Senate Finance Committee correspondence (2021–2022)",
    ],
  },
  {
    id: "org-03",
    type: "organization",
    name: "HBRK Associates, Inc.",
    description:
      "A corporation associated with Epstein, named in the U.S. Virgin Islands' lawsuit against JPMorgan Chase as one of the Epstein Enterprise entities that held accounts at the bank. Congressional and court records suggest it functioned as a financial conduit.",
    keyPeople: ["Jeffrey Epstein", "Darren Indyke", "Richard Kahn"],
    image: { strategy: "none" },
    sources: [
      "Government of USVI v. JPMorgan Chase (2022)",
      "Senate Finance Committee correspondence (2021)",
    ],
  },
  {
    id: "org-04",
    type: "organization",
    name: "C.O.U.Q. Foundation",
    description:
      "A nonprofit foundation associated with Epstein that held accounts at JPMorgan Chase and is named in the USVI's RICO suit as part of the Epstein Enterprise. Referenced in a USVI subpoena as a conduit for payments to females associated with Epstein. An example of a nominally charitable entity that prosecutors allege served the trafficking operation.",
    location: "U.S. Virgin Islands",
    keyPeople: ["Jeffrey Epstein", "Darren Indyke", "Richard Kahn"],
    image: { strategy: "none" },
    sources: [
      "Government of USVI v. JPMorgan Chase (2022)",
      "USVI Superior Court subpoena (Case No. ST-20-CV-014)",
    ],
  },
  {
    id: "org-05",
    type: "organization",
    name: "Hyperion Air, Inc.",
    description:
      "The corporate entity through which Epstein held and operated his aircraft, including the Boeing 727 commonly referred to as the 'Lolita Express.' Named in both the USVI RICO lawsuit and related litigation as part of the Epstein Enterprise. Flight logs maintained under this entity became key evidence in civil and criminal proceedings.",
    dateRange: "Active through 2010s; aircraft sold 2017",
    location: "U.S. Virgin Islands (registered)",
    keyPeople: [
      "Jeffrey Epstein",
      "David Rodgers",
      "Larry Visoski",
      "Ghislaine Maxwell",
      "Sarah Kellen",
    ],
    image: { strategy: "wikipedia", article: "Lolita_Express" },
    sources: [
      "Government of USVI v. JPMorgan Chase (2022)",
      "Wikipedia, 'Lolita Express'",
      "Flight logs from Giuffre v. Maxwell",
    ],
  },
  {
    id: "org-06",
    type: "organization",
    name: "Plan D, LLC",
    description:
      "The corporate entity used to hold Epstein's Gulfstream G550 private jet, according to court records and investigative reporting. Named in litigation as part of the web of shell companies through which Epstein held discrete assets, exemplifying the pattern of using separate LLCs to hold individual high-value assets.",
    keyPeople: ["Jeffrey Epstein", "Darren Indyke", "Richard Kahn"],
    image: { strategy: "none" },
    sources: [
      "Government of USVI v. Estate of Jeffrey Epstein (Case No. ST-20-CV-014)",
      "Senate Finance Committee and JPMorgan investigation materials (2021–2022)",
    ],
  },
  {
    id: "org-07",
    type: "organization",
    name: "J. Epstein Virgin Islands Foundation, Inc.",
    shortName: "J. Epstein VI Foundation",
    description:
      "A nonprofit foundation registered in the U.S. Virgin Islands that was part of the corporate structure of the Epstein Enterprise. The USVI RICO complaint alleges the foundation was used as a conduit for payments, including an improperly routed payment related to illegal construction on Great Saint James.",
    location: "U.S. Virgin Islands",
    keyPeople: ["Jeffrey Epstein", "Darren Indyke", "Richard Kahn"],
    image: { strategy: "none" },
    sources: [
      "Government of USVI v. Estate of Jeffrey Epstein (Second Amended Complaint)",
      "USVI Superior Court subpoena records",
      "Government of USVI v. JPMorgan Chase (2022)",
    ],
  },
  {
    id: "org-08",
    type: "organization",
    name: "The 1953 Trust",
    description:
      "The trust into which Epstein transferred substantially all of his assets two days before his death on August 10, 2019. Named for the year of Epstein's birth, the trust became the primary vehicle through which his estate is administered. Its creation in the immediate prelude to his death raised legal questions about asset protection and the scope of the estate available to victims.",
    dateRange: "Created August 8, 2019",
    location: "U.S. Virgin Islands (probate)",
    keyPeople: ["Jeffrey Epstein", "Darren Indyke", "Richard Kahn"],
    image: { strategy: "wikipedia", article: "Estate_of_Jeffrey_Epstein" },
    sources: [
      "Matter of the Estate of Jeffrey E. Epstein (No. ST-21-RV-00005)",
      "Wikipedia, 'Estate of Jeffrey Epstein'",
      "DOJ court records index",
    ],
  },
  {
    id: "org-09",
    type: "organization",
    name: "MC2 Model Management",
    description:
      "A modeling agency founded and operated by Jean-Luc Brunel, a French model scout with documented ties to Epstein spanning decades. Specifically named in Julie K. Brown's 'Perversion of Justice' investigation and in the 2019 federal indictment as a source through which young women were recruited under the guise of modeling opportunities.",
    dateRange: "Active c. 1990s–2010s",
    location: "New York (U.S. operations); also Paris and Brazil",
    keyPeople: ["Jean-Luc Brunel", "Jeffrey Epstein", "Ghislaine Maxwell"],
    image: { strategy: "wikipedia", article: "Jean-Luc_Brunel" },
    sources: [
      "Julie K. Brown, 'Perversion of Justice,' Miami Herald (2018)",
      "U.S. v. Epstein Indictment (S.D.N.Y. 2019)",
      "Vicky Ward, Vanity Fair (2003)",
    ],
  },
  {
    id: "org-10",
    type: "organization",
    name: "Gratitude America, Ltd.",
    description:
      "A nonprofit organization associated with Epstein, named in the USVI's subpoena requests as a conduit for payments related to females associated with Epstein. Appears in multiple USVI court documents requesting communications and financial records related to Epstein's network of payments.",
    keyPeople: ["Jeffrey Epstein", "Darren Indyke", "Richard Kahn"],
    image: { strategy: "none" },
    sources: [
      "USVI Superior Court subpoena (Case No. ST-20-CV-014)",
      "Government of USVI v. Estate of Jeffrey Epstein (Second Amended Complaint)",
      "Government of USVI v. JPMorgan Chase (2022)",
    ],
  },
];

// =============================================================================
// EVENTS
// =============================================================================

export const EVENTS: SeedEntity[] = [
  {
    id: "event-01",
    type: "event",
    name: "Palm Beach Police Investigation Opens",
    description:
      "In March 2005, the Palm Beach Police Department opened a criminal investigation into Epstein after a parent reported he had paid her 14-year-old stepdaughter for a sexual massage. Lead detective Joseph Recarey and Chief Michael Reiter conducted a year-long investigation, ultimately identifying at least 36 girls ages 14–17 with similar accounts. The police referred the case to the FBI in October 2005.",
    dateRange: "March 2005 – 2006",
    location: "Palm Beach, Florida",
    keyPeople: ["Jeffrey Epstein", "Joseph Recarey", "Michael Reiter"],
    image: { strategy: "none" },
    sources: [
      "DOJ Office of Professional Responsibility Report (2020)",
      "Julie K. Brown, 'Perversion of Justice,' Miami Herald (2018)",
      "NPR Epstein timeline (2025)",
    ],
  },
  {
    id: "event-02",
    type: "event",
    name: "Federal Non-Prosecution Agreement (NPA) Signed",
    shortName: "Federal NPA Signed",
    description:
      "In September 2007, after months of negotiations between Epstein's defense team and U.S. Attorney Alexander Acosta's office, the parties reached a secret non-prosecution agreement. Under the NPA, Epstein would plead guilty to two state charges in exchange for the federal government agreeing not to prosecute him. The agreement also granted immunity to Epstein's unnamed 'potential co-conspirators' and was kept secret from victims, which a federal court later ruled violated the Crime Victims' Rights Act.",
    dateRange: "NPA signed September 2007",
    location: "Southern District of Florida, Miami",
    keyPeople: [
      "Jeffrey Epstein",
      "Alexander Acosta",
      "Jay Lefkowitz",
      "Alan Dershowitz",
      "Kenneth Starr",
    ],
    image: { strategy: "none" },
    sources: [
      "DOJ Office of Professional Responsibility Report (2020)",
      "Julie K. Brown, 'Perversion of Justice,' Miami Herald (2018)",
      "Judge Marra ruling, February 2019 (CVRA violation finding)",
    ],
  },
  {
    id: "event-03",
    type: "event",
    name: "Epstein's State Guilty Plea and Work-Release Sentence",
    shortName: "2008 Guilty Plea",
    description:
      "On June 30, 2008, Epstein pleaded guilty in Florida's 15th Judicial Circuit to one count of felony solicitation of prostitution and one count of procuring a person under 18 for prostitution. Sentenced to 18 months in Palm Beach County jail, he was permitted to leave the jail facility six days a week for up to 12–16 hours per day under a work-release arrangement widely reported as extraordinary. Released after approximately 13 months.",
    dateRange: "Guilty plea June 30, 2008; released July 22, 2009",
    location: "15th Judicial Circuit, Palm Beach County, Florida",
    keyPeople: [
      "Jeffrey Epstein",
      "Jorge Labarga",
      "Alexander Acosta",
      "Ric Bradshaw",
    ],
    image: { strategy: "none" },
    sources: [
      "DOJ Office of Professional Responsibility Report (2020)",
      "Julie K. Brown, 'Perversion of Justice,' Miami Herald (2018)",
      "NPR Epstein timeline (2025)",
    ],
  },
  {
    id: "event-04",
    type: "event",
    name: "'Perversion of Justice' Published",
    description:
      "On November 28, 2018, investigative reporter Julie K. Brown published a three-part investigative series in the Miami Herald titled 'Perversion of Justice,' documenting Epstein's abuse of dozens of underage girls, the failures of the 2008 plea deal, and the role of then-U.S. Attorney Alexander Acosta. The series triggered intense public and political pressure, prompted the Manhattan U.S. Attorney's office to open a new investigation, and directly led to Epstein's July 2019 arrest.",
    dateRange: "Published November 28, 2018",
    location: "Miami Herald",
    keyPeople: ["Julie K. Brown", "Jeffrey Epstein", "Alexander Acosta"],
    image: { strategy: "none" },
    sources: [
      "Julie K. Brown, 'Perversion of Justice,' Miami Herald (2018)",
      "Wikipedia, 'Julie K. Brown'",
      "NPR Epstein timeline (2025)",
    ],
  },
  {
    id: "event-05",
    type: "event",
    name: "Epstein's 2019 Federal Arrest at Teterboro",
    shortName: "2019 Federal Arrest",
    description:
      "On July 6, 2019, FBI and NYPD agents from the Crimes Against Children Task Force arrested Epstein at Teterboro Airport as he landed on his private jet returning from Paris. A search of his Manhattan townhouse the same day uncovered photographs federal prosecutors described as appearing to depict nude minors. A federal indictment unsealed July 8 charged Epstein with sex trafficking of minors and conspiracy. A judge denied bail.",
    dateRange: "Arrest July 6, 2019; indictment July 8, 2019",
    location: "Teterboro Airport, New Jersey; SDNY",
    keyPeople: ["Jeffrey Epstein", "Geoffrey Berman"],
    image: { strategy: "none" },
    sources: [
      "U.S. v. Epstein Indictment, No. 1:19-cr-00490 (S.D.N.Y. 2019)",
      "U.S. Attorney Geoffrey Berman press statement (July 8, 2019)",
      "NPR Epstein timeline (2025)",
    ],
  },
  {
    id: "event-06",
    type: "event",
    name: "Epstein's Death at MCC New York",
    description:
      "On August 10, 2019, Jeffrey Epstein was found dead in his cell at the Metropolitan Correctional Center in New York. His death was ruled a suicide by hanging by the New York City medical examiner. The circumstances were immediately controversial: prison guards had failed to check on him as required, surveillance cameras near his cell were not functioning, and he had been removed from suicide watch approximately two weeks before his death.",
    dateRange: "August 10, 2019",
    location: "Metropolitan Correctional Center, Lower Manhattan",
    keyPeople: [
      "Jeffrey Epstein",
      "Tova Noel",
      "Michael Thomas",
      "William Barr",
    ],
    image: { strategy: "none" },
    sources: [
      "DOJ Office of Inspector General Report on MCC failures (2021)",
      "U.S. v. Noel, No. 1:19-cr-00830 (S.D.N.Y. 2019)",
      "PBS NewsHour timeline (2026)",
    ],
  },
  {
    id: "event-07",
    type: "event",
    name: "Ghislaine Maxwell's Arrest and Federal Indictment",
    shortName: "Maxwell Arrested",
    description:
      "On July 2, 2020, federal agents arrested Ghislaine Maxwell at a property in Bradford, New Hampshire, where she had been living quietly since Epstein's death. She was charged with six federal counts including sex trafficking of a minor, conspiracy, and perjury. Maxwell was convicted on five of six counts on December 29, 2021 and sentenced to 20 years in federal prison on June 28, 2022.",
    dateRange: "Arrested July 2, 2020; sentenced June 28, 2022",
    location: "Arrest: Bradford, NH; trial: Southern District of New York",
    keyPeople: [
      "Ghislaine Maxwell",
      "Jeffrey Epstein",
      "Maurene Comey",
      "Alison Moe",
    ],
    image: { strategy: "wikipedia", article: "Ghislaine_Maxwell" },
    sources: [
      "U.S. v. Maxwell, No. 1:20-cr-00330 (S.D.N.Y. 2020)",
      "New York Times trial coverage (December 2021)",
      "PBS NewsHour timeline (2026)",
    ],
  },
  {
    id: "event-08",
    type: "event",
    name: "Judge Marra's CVRA Ruling",
    description:
      "In February 2019, U.S. District Judge Kenneth Marra in the Southern District of Florida ruled that the 2008 non-prosecution agreement violated the Crime Victims' Rights Act because the U.S. Attorney's Office had secretly negotiated the deal without informing Epstein's victims as required by federal law. The ruling was a significant legal rebuke and intensified the public pressure that contributed to the 2019 federal action.",
    dateRange: "Ruling issued February 21, 2019",
    location: "U.S. District Court, Southern District of Florida",
    keyPeople: [
      "Kenneth Marra",
      "Bradley Edwards",
      "Paul Cassell",
      "Jeffrey Epstein",
      "Alexander Acosta",
    ],
    image: { strategy: "none" },
    sources: [
      "Jane Doe 1 et al. v. United States, No. 9:08-cv-80736 (S.D. Fla.)",
      "Julie K. Brown, Miami Herald (February 2019)",
      "PBS NewsHour timeline (2026)",
    ],
  },
  {
    id: "event-09",
    type: "event",
    name: "Epstein's September 2002 Africa Trip",
    shortName: "2002 Africa Trip",
    description:
      "In September 2002, Epstein flew former President Bill Clinton, actors Kevin Spacey and Chris Tucker, and others on his Boeing 727 on a multi-country trip through Africa, including Ghana, Nigeria, Rwanda, Mozambique, and South Africa. Publicly described as a humanitarian tour connected to the Clinton Foundation's HIV/AIDS work. Documented in the flight logs submitted as court exhibits — one of the most frequently cited examples of Epstein's documented social relationships with prominent figures.",
    dateRange: "September 2002",
    location: "Africa: Ghana, Nigeria, Rwanda, Mozambique, South Africa",
    keyPeople: [
      "Jeffrey Epstein",
      "Bill Clinton",
      "Kevin Spacey",
      "Chris Tucker",
      "Ghislaine Maxwell",
      "Doug Band",
    ],
    image: { strategy: "wikipedia", article: "Lolita_Express" },
    sources: [
      "Flight logs from Giuffre v. Maxwell, No. 15-cv-07433",
      "Washington Examiner flight manifest reporting (2019)",
      "Wikipedia, 'Lolita Express'",
    ],
  },
  {
    id: "event-10",
    type: "event",
    name: "Giuffre v. Maxwell Civil Lawsuit",
    description:
      "In 2015, accuser Virginia Roberts Giuffre filed a defamation lawsuit against Ghislaine Maxwell after Maxwell publicly called her a liar. The case generated hundreds of pages of court documents, depositions, and exhibits — including flight logs and correspondence — that became the primary public documentary record of the Epstein network before the 2019 criminal proceedings. Major document unsealing orders came in 2019 and January 2024.",
    dateRange: "Filed 2015; major document unsealings 2019 and 2024",
    location: "U.S. District Court, Southern District of New York",
    keyPeople: [
      "Virginia Roberts Giuffre",
      "Ghislaine Maxwell",
      "Jeffrey Epstein",
      "Bradley Edwards",
      "David Boies",
      "Julie K. Brown",
    ],
    image: { strategy: "wikipedia", article: "Virginia_Giuffre" },
    sources: [
      "Giuffre v. Maxwell, No. 15-cv-07433 (S.D.N.Y. 2015)",
      "New York Times coverage of 2024 document release",
      "PBS NewsHour timeline (2026)",
    ],
  },
  {
    id: "event-11",
    type: "event",
    name: "Palm Beach Grand Jury Indictment",
    shortName: "2006 State Indictment",
    description:
      "On July 19, 2006, a Palm Beach County grand jury indicted Epstein on a single count of felony solicitation of prostitution under Florida law — a charge that infuriated Police Chief Michael Reiter, who believed the evidence supported far more serious charges including federal sex trafficking. The decision by State Attorney Barry Krischer to pursue only a single state charge became a central controversy.",
    dateRange: "Indictment July 19, 2006; arrest July 23, 2006",
    location: "Palm Beach County, Florida",
    keyPeople: [
      "Jeffrey Epstein",
      "Barry Krischer",
      "Michael Reiter",
      "Joseph Recarey",
    ],
    image: { strategy: "none" },
    sources: [
      "DOJ Office of Professional Responsibility Report (2020)",
      "Julie K. Brown, 'Perversion of Justice,' Miami Herald (2018)",
      "NPR Epstein timeline (2025)",
    ],
  },
];

// =============================================================================
// FLAT EXPORT
// =============================================================================

export const SEED_ENTITIES: SeedEntity[] = [
  ...PLACES,
  ...ORGANIZATIONS,
  ...EVENTS,
];
