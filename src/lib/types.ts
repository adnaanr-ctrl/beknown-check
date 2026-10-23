export type Language = "english" | "tamil-english" | "hinglish" | "kannada-english";
export type BusinessType = "cafe" | "juice-bar" | "restaurant" | "bakery" | "other";

export interface Facts {
  hours: string;
  priceRange: string;
  outlets: string;
  seating: string;
  signatureItems: string;
  other: string;
}

export interface Profile {
  name: string;
  area: string;
  type: BusinessType;
  language: Language;
  facts: Facts;
}

export interface Source {
  title: string;
  uri: string;
}

export interface GeneratedQuestion {
  text: string;
  namesBusiness: boolean;
}

export interface AnswerRecord {
  id: string;
  questionIndex: number;
  run: number;
  question: string;
  namesBusiness: boolean;
  status: "pending" | "ok" | "error";
  text: string;
  sources: Source[];
  model?: string;
  error?: string;
  /** Quick client-side string check, used only for the live counter. */
  namedQuick: boolean;
}

export type ClaimStatus = "conflict" | "match" | "unchecked";

export interface AnalysisAnswer {
  index: number;
  businesses: string[];
  targetNamed: boolean;
  targetRank: number | null;
}

export interface Claim {
  field: string;
  claim: string;
  status: ClaimStatus;
  ownerValue: string | null;
  answerIndexes: number[];
  answersDisagree: boolean;
  note: string;
  sourceUrl: string | null;
}

export interface NotStated {
  field: string;
  ownerValue: string;
}

export interface Analysis {
  answers: AnalysisAnswer[];
  claims: Claim[];
  notStated: NotStated[];
  gaps: string[];
  summary: string;
}

export interface Faq {
  question: string;
  answer: string;
}

export interface Fixes {
  googleDescription: string;
  marketplaceDescription: string;
  hoursLine: string | null;
  faqs: Faq[];
  needsFromOwner: string[];
  unverifiedNumbers: string[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
