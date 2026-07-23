/**
 * Le backend (NestJS + class-validator) renvoie les erreurs sous la forme
 * `{"statusCode":400,"message":"texte" | ["texte", ...],"error":"Bad Request"}`.
 * Sans ce parsing, ce JSON brut (ou pire, un `statusCode`/`error` en trop)
 * finissait affiché tel quel dans les bandeaux d'erreur de l'app.
 */
export function friendlyApiError(status: number, rawBody: string, fallbackText: string): string {
  const raw = rawBody.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { message?: string | string[] };
      if (Array.isArray(parsed.message)) return parsed.message.join(' ');
      if (typeof parsed.message === 'string') return parsed.message;
    } catch {
      // Pas du JSON (ex: "Unauthorized" brut) — on garde le texte tel quel ci-dessous.
      return raw;
    }
  }
  return `${fallbackText} (${status})`;
}
