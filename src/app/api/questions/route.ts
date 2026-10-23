import { NextResponse } from "next/server";
import { GeminiError, generateJson } from "@/lib/gemini";
import { geminiErrorResponse, readBody } from "@/lib/http";
import { QUESTIONS_SYSTEM, fallbackQuestions, finaliseQuestions, questionsPrompt } from "@/lib/prompts";
import { generatedQuestionsSchema, questionsRequestSchema } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await readBody(req, questionsRequestSchema);
  if (!body.ok) return body.res;
  const { profile } = body.data;

  try {
    const { data, model } = await generateJson(QUESTIONS_SYSTEM, questionsPrompt(profile), generatedQuestionsSchema);
    return NextResponse.json({ questions: finaliseQuestions(data.questions, profile), source: "gemini", model });
  } catch (e) {
    // If the model's output was unreadable, fall back to fixed templates so the check can still run.
    if (e instanceof GeminiError && e.code === "bad_output") {
      return NextResponse.json({ questions: fallbackQuestions(profile), source: "template", model: null });
    }
    return geminiErrorResponse(e);
  }
}
