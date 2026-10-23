import { z } from "zod";

const short = (max: number) => z.string().trim().max(max);

export const factsSchema = z.object({
  hours: short(300).default(""),
  priceRange: short(200).default(""),
  outlets: short(400).default(""),
  seating: short(200).default(""),
  signatureItems: short(400).default(""),
  other: short(600).default(""),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter the business name.").max(80),
  area: z.string().trim().min(2, "Enter the area or city.").max(80),
  type: z.enum(["cafe", "juice-bar", "restaurant", "bakery", "other"]).default("cafe"),
  language: z.enum(["english", "tamil-english", "hinglish", "kannada-english"]).default("english"),
  facts: factsSchema.default({
    hours: "",
    priceRange: "",
    outlets: "",
    seating: "",
    signatureItems: "",
    other: "",
  }),
});

export const questionsRequestSchema = z.object({ profile: profileSchema });

export const askRequestSchema = z.object({
  question: z.string().trim().min(5).max(300),
});

const sourceSchema = z.object({
  title: z.string().max(300).default(""),
  uri: z.string().max(1000),
});

export const answerInputSchema = z.object({
  index: z.number().int().min(0).max(40),
  question: z.string().max(300),
  text: z.string().max(6000),
  sources: z.array(sourceSchema).max(20).default([]),
});

export const analyzeRequestSchema = z.object({
  profile: profileSchema,
  answers: z.array(answerInputSchema).min(1).max(30),
});

// ---- Model output schemas (validated after the model responds) ----

export const generatedQuestionsSchema = z.object({
  questions: z
    .array(z.object({ text: z.string().min(5).max(300), namesBusiness: z.boolean() }))
    .min(4)
    .max(10),
});

export const analysisOutputSchema = z.object({
  answers: z
    .array(
      z.object({
        index: z.number().int(),
        businesses: z.array(z.string()).default([]),
        targetNamed: z.boolean().default(false),
        targetRank: z.number().int().nullable().default(null),
      }),
    )
    .default([]),
  claims: z
    .array(
      z.object({
        field: z.string().default("other"),
        claim: z.string(),
        status: z.enum(["conflict", "match", "unchecked"]).default("unchecked"),
        ownerValue: z.string().nullable().default(null),
        answerIndexes: z.array(z.number().int()).default([]),
        answersDisagree: z.boolean().default(false),
        note: z.string().default(""),
        sourceUrl: z.string().nullable().default(null),
      }),
    )
    .default([]),
  notStated: z.array(z.object({ field: z.string(), ownerValue: z.string() })).default([]),
  gaps: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

export const fixesRequestSchema = z.object({
  profile: profileSchema,
  analysis: analysisOutputSchema,
});

export const fixesOutputSchema = z.object({
  googleDescription: z.string().default(""),
  marketplaceDescription: z.string().default(""),
  hoursLine: z.string().nullable().default(null),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  needsFromOwner: z.array(z.string()).default([]),
});
