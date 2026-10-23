import { NextResponse } from "next/server";
import { askGrounded } from "@/lib/gemini";
import { geminiErrorResponse, readBody } from "@/lib/http";
import { askRequestSchema } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await readBody(req, askRequestSchema);
  if (!body.ok) return body.res;

  try {
    const answer = await askGrounded(body.data.question);
    return NextResponse.json(answer);
  } catch (e) {
    return geminiErrorResponse(e);
  }
}
