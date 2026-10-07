type SentryEnvironmentInput = {
  netlifyContext?: string;
  nodeEnv?: string;
};

const REQUIRED_NETLIFY_SENTRY_VARIABLES = [
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_DSN",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
] as const;

/**
 * Convert Netlify's real deploy contexts to a deliberately small Sentry
 * vocabulary. No branch name or deploy URL is sent as an environment.
 */
export function resolveSentryEnvironment({
  netlifyContext,
  nodeEnv,
}: SentryEnvironmentInput): "production" | "preview" | "branch" | "test" | "development" {
  switch (netlifyContext) {
    case "production":
      return "production";
    case "deploy-preview":
      return "preview";
    case "branch-deploy":
      return "branch";
    case "dev":
      return "development";
    default:
      return nodeEnv === "test" ? "test" : "development";
  }
}

export function missingSentryBuildVariables(
  netlifyContext: string | undefined,
  env: Record<string, string | undefined>,
): string[] {
  if (netlifyContext !== "production" && netlifyContext !== "deploy-preview") return [];

  return REQUIRED_NETLIFY_SENTRY_VARIABLES.filter((name) => !env[name]);
}
