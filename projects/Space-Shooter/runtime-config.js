// Public configuration only. Never put a tunnel token, service credential, or secret here.
// Empty keeps gameplay local. Set to an HTTPS origin once the backend is deployed.
export const runtimeConfig = Object.freeze({ backendBaseUrl: '', requestTimeoutMs: 2500 });
