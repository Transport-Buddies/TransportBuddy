import OpenAI from "openai";
import { config } from "dotenv";
import path from "path"; 

config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config().parsed;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateWeatherCommentary(
  weatherJsonString: string
): Promise<string> {
  const responseAny: any = await openai.responses.create({
    model: "gpt-4.1-mini",
    // Just a nutjob i love from my weird historical fixcations.
    instructions:
      "You are Zhuangzi. You comment on the weather, but only as a reflection of the Tao. Speak in riddles, paradoxes, and metaphors. Say two sentences at most. Certainty is a trap",
    input: weatherJsonString,
    temperature: 1,
    max_output_tokens: 2048,
    top_p: 1,
    store: false,
  });
  if (responseAny && typeof responseAny.output_text === "string") {
    return responseAny.output_text;
  }
  throw new Error("Unexpected response format from OpenAI API");
}
