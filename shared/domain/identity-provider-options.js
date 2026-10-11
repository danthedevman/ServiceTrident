export const IDENTITY_PROVIDERS = [
  ['auth0', 'Auth0', 'https://your-tenant.auth0.com/'],
  ['okta', 'Okta', 'https://your-org.okta.com'],
  ['entra', 'Microsoft Entra ID', 'https://login.microsoftonline.com/TENANT-ID/v2.0'],
  ['google', 'Google', 'https://accounts.google.com'],
  ['keycloak', 'Keycloak', 'https://identity.example.com/realms/your-realm'],
  ['onelogin', 'OneLogin', 'https://your-subdomain.onelogin.com/oidc/2'],
  ['ping', 'Ping Identity', 'https://auth.pingone.com/ENVIRONMENT-ID/as'],
  ['oidc', 'Other OpenID Connect', 'https://identity.example.com'],
].map(([id, label, example]) => ({ id, label, example }));
