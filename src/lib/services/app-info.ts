const APP_INFO = Object.freeze({
  name: "Ferx",
  version: "0.1.0",
});

export function getAppInfo(): Readonly<typeof APP_INFO> {
  return APP_INFO;
}
