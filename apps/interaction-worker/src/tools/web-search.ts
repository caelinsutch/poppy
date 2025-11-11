import { tool } from "ai";
import Exa from "exa-js";
import { z } from "zod";

export const createWebSearchTool = (exaApiKey: string) => {
  const exa = new Exa(exaApiKey);

  return tool({
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
};
