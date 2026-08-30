import { describe, expect, it, afterEach } from "vitest";
import { getSiteUrl } from "./site-url";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getSiteUrl", () => {
  it("falls back to localhost when nothing is configured", () => {
    delete process.env.DEPLOY_PRIME_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("uses NEXT_PUBLIC_SITE_URL when set and Netlify's variable is absent", () => {
    delete process.env.DEPLOY_PRIME_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";

    expect(getSiteUrl()).toBe("https://example.com");
  });

  it("prefers Netlify's DEPLOY_PRIME_URL over NEXT_PUBLIC_SITE_URL — this is what makes a Deploy Preview's redirect URL correct with no manual per-PR configuration", () => {
    process.env.DEPLOY_PRIME_URL = "https://deploy-preview-3--heritage-hommage.netlify.app";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    expect(getSiteUrl()).toBe("https://deploy-preview-3--heritage-hommage.netlify.app");
  });

  it("strips a trailing slash from either source", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.DEPLOY_PRIME_URL = "https://deploy-preview-3--heritage-hommage.netlify.app/";

    expect(getSiteUrl()).toBe("https://deploy-preview-3--heritage-hommage.netlify.app");
  });
});
