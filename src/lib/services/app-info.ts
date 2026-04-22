import packageJson from "../../../package.json";
import tauriConfig from "../../../src-tauri/tauri.conf.json";

const repositoryUrl =
  typeof packageJson.repository === "string" ? packageJson.repository : "";

const APP_INFO = Object.freeze({
  name: tauriConfig.productName,
  version: packageJson.version,
  releasesUrl: repositoryUrl ? `${repositoryUrl}/releases` : "",
});

export function getAppInfo(): Readonly<typeof APP_INFO> {
  return APP_INFO;
}
