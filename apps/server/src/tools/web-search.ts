import { tool } from "ai";
import Exa from "exa-js";
import { z } from "zod";
import { env } from "@/env";

export const exa = new Exa(env.EXA_API_KEY);

export const webSearch = tool({
  description: "Search the web for up-to-date information",
  inputSchema: z.object({
    query: z.string().min(1).max(100).describe("The search query"),
  }),
  execute: async ({ query }) => {
    const { results } = await exa.searchAndContents(query, {
      livecrawl: "always",
      numResults: 3,
      context: true,
      text: true,
    });
    return results.map((result) => ({
      title: result.title,
      url: result.url,
      content: result.text,
      publishedDate: result.publishedDate,
    }));
  },
});
