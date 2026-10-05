export function assertTestHooksAllowed(enabled: boolean) {
  if (!enabled) return;
  const environment = process.env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase();
  if (environment ? environment !== "staging" : process.env.NODE_ENV === "production") {
    throw new Error("Test hooks are disabled outside staging or local development");
  }
}
