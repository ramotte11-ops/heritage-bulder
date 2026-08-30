import { describe, expect, it, vi, afterEach } from "vitest";

const { headers } = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers }));

// Imported after the mock above is registered, per vi.mock's hoisting.
const { getSiteUrl } = await import("./site-url");

const ORIGINAL_ENV = { ...process.env };

function headersFrom(values: Record<string, string>): { get(name: string): string | null } {
  return { get: (name: string) => values[name] ?? null };
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  headers.mockReset();
});

describe("getSiteUrl", () => {
  it("prefers the incoming request's own Host header over any env var — this is what makes a Deploy Preview's redirect URL correct even when platform metadata env vars don't reach the function runtime", async () => {
    delete process.env.DEPLOY_PRIME_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    headers.mockResolvedValue(
      headersFrom({ host: "deploy-preview-3--heritage-hommage.netlify.app", "x-forwarded-proto": "https" }),
    );

    expect(await getSiteUrl()).toBe("https://deploy-preview-3--heritage-hommage.netlify.app");
  });

  it("prefers x-forwarded-host over host when both are present", async () => {
    headers.mockResolvedValue(
      headersFrom({
        host: "internal-lb.example",
        "x-forwarded-host": "deploy-preview-3--heritage-hommage.netlify.app",
        "x-forwarded-proto": "https",
      }),
    );

    expect(await getSiteUrl()).toBe("https://deploy-preview-3--heritage-hommage.netlify.app");
  });

  it("assumes http for a localhost host with no x-forwarded-proto", async () => {
    headers.mockResolvedValue(headersFrom({ host: "localhost:3000" }));

    expect(await getSiteUrl()).toBe("http://localhost:3000");
  });

  it("falls back to DEPLOY_PRIME_URL when no Host header is present", async () => {
    headers.mockResolvedValue(headersFrom({}));
    process.env.DEPLOY_PRIME_URL = "https://deploy-preview-3--heritage-hommage.netlify.app";

    expect(await getSiteUrl()).toBe("https://deploy-preview-3--heritage-hommage.netlify.app");
  });

  it("falls back to NEXT_PUBLIC_SITE_URL when no Host header and no DEPLOY_PRIME_URL are present", async () => {
    headers.mockResolvedValue(headersFrom({}));
    delete process.env.DEPLOY_PRIME_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";

    expect(await getSiteUrl()).toBe("https://example.com");
  });

  it("falls back to localhost when nothing at all is available", async () => {
    headers.mockResolvedValue(headersFrom({}));
    delete process.env.DEPLOY_PRIME_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(await getSiteUrl()).toBe("http://localhost:3000");
  });

  it("strips a trailing slash from any source", async () => {
    headers.mockResolvedValue(headersFrom({}));
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.DEPLOY_PRIME_URL = "https://deploy-preview-3--heritage-hommage.netlify.app/";

    expect(await getSiteUrl()).toBe("https://deploy-preview-3--heritage-hommage.netlify.app");
  });
});
