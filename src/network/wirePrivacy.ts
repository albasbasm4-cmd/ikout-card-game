/** Authentication belongs to connection bindings, never host-to-client data. */
const AUTH_FIELDS = new Set([
  "clientToken",
  "playerToken",
  "token",
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "authorization",
  "password",
  "secret",
]);

export function withoutAuthSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutAuthSecrets) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !AUTH_FIELDS.has(key))
        .map(([key, item]) => [key, withoutAuthSecrets(item)]),
    ) as T;
  }
  return value;
}
