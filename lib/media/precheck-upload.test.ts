import { describe, expect, it } from "vitest";
import { MAX_MEDIA_BYTES } from "@/config/media";
import { precheckHeroPhotoFile } from "./precheck-upload";

describe("precheckHeroPhotoFile — Mission 033 section 8, a UX convenience only", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s under the size limit", (type) => {
    expect(precheckHeroPhotoFile({ type, size: 1024 })).toBeNull();
  });

  it("accepts a file exactly at the size limit", () => {
    expect(precheckHeroPhotoFile({ type: "image/jpeg", size: MAX_MEDIA_BYTES })).toBeNull();
  });

  it.each(["image/heic", "image/heif", "image/avif", "image/gif", "image/svg+xml", "video/mp4", "application/pdf"])(
    "refuses %s as unsupported_format",
    (type) => {
      expect(precheckHeroPhotoFile({ type, size: 1024 })).toBe("unsupported_format");
    },
  );

  it("refuses an oversized file as file_too_large", () => {
    expect(precheckHeroPhotoFile({ type: "image/jpeg", size: MAX_MEDIA_BYTES + 1 })).toBe("file_too_large");
  });

  it("checks the format before the size — an unsupported format is never reported as too large", () => {
    expect(precheckHeroPhotoFile({ type: "image/gif", size: MAX_MEDIA_BYTES + 1 })).toBe(
      "unsupported_format",
    );
  });

  it("refuses an empty/unset type string", () => {
    expect(precheckHeroPhotoFile({ type: "", size: 1024 })).toBe("unsupported_format");
  });
});
