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
    // I love no country for old men. You should watch it. 
    instructions:
      "You are Anton Chigurh. Cryptically comment on current weather. Just 2 sentences should do.",
    input: weatherJsonString,
    temperature: 1,
    max_output_tokens: 2048,
    top_p: 1,
    store: true,
  });
  if (responseAny && typeof responseAny.output_text === "string") {
    return responseAny.output_text.trim();
  }
  throw new Error("Unexpected response format from OpenAI API");
}
