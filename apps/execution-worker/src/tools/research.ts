import { logger } from "@poppy/hono-helpers";
import { tool } from "ai";
import Exa from "exa-js";
import { z } from "zod";

export const createResearchTool = (apiKey: string) => {
  return tool({
    description: `Perform web research using Exa search. Use this to find information, articles, or data on the internet.`,
    inputSchema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of results to return (default: 5)"),
    }),
    execute: async ({ query, maxResults = 5 }) => {
      logger.info("Research tool: Starting web search", {
        query,
        maxResults,
      });

      try {
        const exa = new Exa(apiKey);

        const searchResults = await exa.searchAndContents(query, {
          numResults: maxResults,
          text: {
            maxCharacters: 500,
          },
          highlights: {
            numSentences: 3,
          },
        });

        const results = searchResults.results.map((result) => ({
          title: result.title,
          url: result.url,
          snippet: result.text || result.highlights?.[0] || "",
          publishedDate: result.publishedDate,
        }));

        logger.info("Research tool: Search completed successfully", {
          query,
          resultCount: results.length,
          urls: results.map((r) => r.url),
        });

        return {
          type: "research_results" as const,
          results,
          query,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("Research tool: Search failed", {
          query,
          error: errorMessage,
        });
        throw error;
      }
    },
  });
};
