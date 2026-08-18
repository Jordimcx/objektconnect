export function appUrl(path: string) {
  const baseUrl = configuredAppUrl();
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export function configuredAppUrl() {
  const configured = process.env.APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  const baseUrl = configured || (vercelHost ? `https://${vercelHost}` : "");

  if (!baseUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_URL muss in der Produktionsumgebung gesetzt sein.");
    }
    return "http://localhost:3000";
  }

  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_URL muss mit http:// oder https:// beginnen.");
  }
  return url.toString().replace(/\/$/, "");
}
