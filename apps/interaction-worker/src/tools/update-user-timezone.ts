import { users } from "@poppy/db";
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";

// Common IANA timezone identifiers for validation
const validTimezones = new Set([
  // US timezones
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "America/Puerto_Rico",
  // Additional US-specific
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Kentucky/Louisville",
  "America/Boise",
  // Canada
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  // Other common timezones
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
  "Australia/Melbourne",
]);

/**
 * Validates if a string is a valid IANA timezone identifier
 */
function isValidTimezone(tz: string): boolean {
  // Check our whitelist first
  if (validTimezones.has(tz)) return true;

  // Try to validate using Intl API
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Tool for updating a user's timezone after they confirm it
 * This should be called when the user explicitly confirms or provides their timezone
 */
export const createUpdateUserTimezoneTool = (db: Database, userId: string) => {
  return tool({
    description: `Update the user's timezone after they confirm it.
Use this when:
- The user tells you their timezone (e.g., "I'm in Pacific time")
- The user confirms a timezone you asked about (e.g., "yeah that's right")
- The user corrects their timezone (e.g., "actually I'm in Central time")

Common timezone examples:
- Eastern: America/New_York
- Central: America/Chicago
- Mountain: America/Denver
- Pacific: America/Los_Angeles
- Alaska: America/Anchorage
- Hawaii: Pacific/Honolulu`,
    inputSchema: z.object({
      timezone: z
        .string()
        .describe(
          "IANA timezone identifier (e.g., 'America/Los_Angeles' for Pacific time)",
        ),
    }),
    execute: async ({ timezone }) => {
      // Validate timezone
      if (!isValidTimezone(timezone)) {
        return {
          type: "timezone_update_failed" as const,
          error: `Invalid timezone: ${timezone}. Use IANA format like 'America/Los_Angeles'.`,
        };
      }

      try {
        await db
          .update(users)
          .set({
            timezone,
            timezoneSource: "confirmed",
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        return {
          type: "timezone_updated" as const,
          timezone,
          message: `Timezone updated to ${timezone}`,
        };
      } catch (error) {
        return {
          type: "timezone_update_failed" as const,
          error:
            error instanceof Error
              ? error.message
              : "Failed to update timezone",
        };
      }
    },
  });
};
