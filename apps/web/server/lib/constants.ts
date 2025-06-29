let parsedGoogleCreds = {};
try {
  parsedGoogleCreds = JSON.parse(process.env.GOOGLE_API_CREDENTIALS || "{}");
} catch (e) {
  // Silently handle parse errors - credentials might not be configured
  parsedGoogleCreds = {};
}
export const GOOGLE_API_CREDENTIALS = process.env.GOOGLE_API_CREDENTIALS || "{}";
export const { client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET } =
  parsedGoogleCreds?.web || {};
export const GOOGLE_LOGIN_ENABLED = process.env.GOOGLE_LOGIN_ENABLED === "true";
export const IS_GOOGLE_LOGIN_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_LOGIN_ENABLED);
export const IS_SAML_LOGIN_ENABLED = !!(process.env.SAML_DATABASE_URL && process.env.SAML_ADMINS);
