import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Health check endpoints", () => {
  it("GET /health should return ok status with database connection", async () => {
    const response = await SELF.fetch("https://example.com/health");
    expect(response.status).toBe(200);

    const data = await response.json<{
      status: string;
      timestamp: string;
      database: string;
    }>();
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe("string");
    expect(data.database).toBe("connected");
  });
});
