/**
 * Mission 06-D — content-addressed URLs for the twelve audited decors.
 *
 * The original Studio files remain in place for rollback compatibility.
 * Each `src` below points to a byte-identical copy whose filename starts
 * with the complete SHA-256 of its contents. A changed image must therefore
 * receive a new URL; reusing an existing URL with different bytes is caught
 * by `decor-fingerprints.test.ts` in the normal CI test suite.
 */
export const DECOR_FINGERPRINTS = {
  heroLightDesktopMaster: {
    originalSrc: "/assets/hero/intemporel/runtime/hero-runtime-light-desktop.png",
    src: "/assets/fingerprinted/5c850e322a5d564b47e4ca672bb3c2b32a8f26e7ea95620f4fecb72052aaa17e-hero-runtime-light-desktop.png",
    sha256: "5c850e322a5d564b47e4ca672bb3c2b32a8f26e7ea95620f4fecb72052aaa17e",
    bytes: 1_696_763,
  },
  heroLightMobileMaster: {
    originalSrc: "/assets/hero/intemporel/runtime/hero-runtime-light-mobile.png",
    src: "/assets/fingerprinted/b21b7238c2a0a254e923cc1e722ef0b799e2a468bcf0e938c4566bc34631d48f-hero-runtime-light-mobile.png",
    sha256: "b21b7238c2a0a254e923cc1e722ef0b799e2a468bcf0e938c4566bc34631d48f",
    bytes: 1_843_804,
  },
  heroDarkDesktopMaster: {
    originalSrc: "/assets/hero/intemporel/runtime/hero-runtime-dark-desktop.png",
    src: "/assets/fingerprinted/d65effe0466f82c897d1ea7c850e26ee30efe48982b3f574b942fb7c9a6710d0-hero-runtime-dark-desktop.png",
    sha256: "d65effe0466f82c897d1ea7c850e26ee30efe48982b3f574b942fb7c9a6710d0",
    bytes: 1_662_819,
  },
  heroDarkMobileMaster: {
    originalSrc: "/assets/hero/intemporel/runtime/hero-runtime-dark-mobile.png",
    src: "/assets/fingerprinted/f3f0605c8dcd75512714a7bffb670970fa92ed60a9c7d53dace9cffdcfa0601d-hero-runtime-dark-mobile.png",
    sha256: "f3f0605c8dcd75512714a7bffb670970fa92ed60a9c7d53dace9cffdcfa0601d",
    bytes: 1_848_435,
  },
  heroMobileLightPlate: {
    originalSrc: "/assets/hero/intemporel/runtime/HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_PLATE_RUNTIME_CLEAN_V2.png",
    src: "/assets/fingerprinted/91c902ee25725b0fafbccb4a2f4138026947a30fc06f94ae0132c0710fc14a6e-HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_PLATE_RUNTIME_CLEAN_V2.png",
    sha256: "91c902ee25725b0fafbccb4a2f4138026947a30fc06f94ae0132c0710fc14a6e",
    bytes: 2_393_048,
  },
  heroMobileLightMask: {
    originalSrc: "/assets/hero/intemporel/runtime/HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_MASK_RUNTIME_CLEAN_V1.png",
    src: "/assets/fingerprinted/8df35f9e9222e0dca243e70e629c600cf9c0f1ff72028735f459db2ed82653f8-HERO_INTEMPOREL_MOBILE_LIGHT_PHOTO_MASK_RUNTIME_CLEAN_V1.png",
    sha256: "8df35f9e9222e0dca243e70e629c600cf9c0f1ff72028735f459db2ed82653f8",
    bytes: 8_042,
  },
  heroMobileDarkOverlay: {
    originalSrc: "/assets/hero/intemporel/runtime/HERO_INTEMPOREL_MOBILE_DARK_ALPHA_RUNTIME_ASSET_V2(1).png",
    src: "/assets/fingerprinted/aab7752aad7d707a0db4c46cef344d852b32dfd86ee3dcfa4eeac1e09c1a36c0-HERO_INTEMPOREL_MOBILE_DARK_ALPHA_RUNTIME_ASSET_V2(1).png",
    sha256: "aab7752aad7d707a0db4c46cef344d852b32dfd86ee3dcfa4eeac1e09c1a36c0",
    bytes: 2_856_502,
  },
  heroDesktopLightOverlay: {
    originalSrc: "/assets/hero/intemporel/runtime/HERO_INTEMPOREL_DESKTOP_LIGHT_ALPHA_RUNTIME_ASSET_V2.png",
    src: "/assets/fingerprinted/6a614a9db6367eb7a9ad11a353df167504140b3d16455bd31615315382b86651-HERO_INTEMPOREL_DESKTOP_LIGHT_ALPHA_RUNTIME_ASSET_V2.png",
    sha256: "6a614a9db6367eb7a9ad11a353df167504140b3d16455bd31615315382b86651",
    bytes: 2_347_961,
  },
  heroDesktopDarkOverlay: {
    originalSrc: "/assets/hero/intemporel/runtime/HERO_INTEMPOREL_DESKTOP_DARK_ALPHA_RUNTIME_ASSET_V1(1).png",
    src: "/assets/fingerprinted/9e8419e9446838367210893897f1f02434e30a34e61f1231f04634d95a2d2f8b-HERO_INTEMPOREL_DESKTOP_DARK_ALPHA_RUNTIME_ASSET_V1(1).png",
    sha256: "9e8419e9446838367210893897f1f02434e30a34e61f1231f04634d95a2d2f8b",
    bytes: 2_632_136,
  },
  builderDesktopBackground: {
    originalSrc: "/assets/builder/backgrounds/heritage-builder-background-desktop.png",
    src: "/assets/fingerprinted/1dbc4e705f8e056cd42622cddd769b658c49d776ecd99f5891d87cce64f57393-heritage-builder-background-desktop.png",
    sha256: "1dbc4e705f8e056cd42622cddd769b658c49d776ecd99f5891d87cce64f57393",
    bytes: 2_187_624,
  },
  builderMobileBackground: {
    originalSrc: "/assets/builder/backgrounds/heritage-builder-background-mobile.png",
    src: "/assets/fingerprinted/a45b42834151d61381e88e010b742a15e8a851adf803bea14a375c780775d4f3-heritage-builder-background-mobile.png",
    sha256: "a45b42834151d61381e88e010b742a15e8a851adf803bea14a375c780775d4f3",
    bytes: 2_376_514,
  },
  ceremonyLightTitleSprig: {
    originalSrc: "/assets/ceremony/intemporel/runtime/light/title-sprig.png",
    src: "/assets/fingerprinted/5c40b5f9ea6aee479618fc71ab4151b62cfe860596c66a5c8f6955c6001b4396-title-sprig.png",
    sha256: "5c40b5f9ea6aee479618fc71ab4151b62cfe860596c66a5c8f6955c6001b4396",
    bytes: 10_976,
  },
} as const;

export type DecorFingerprintKey = keyof typeof DECOR_FINGERPRINTS;
