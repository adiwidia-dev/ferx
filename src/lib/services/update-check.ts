const GITHUB_REPO = "adiwidia-dev/ferx";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface ReleaseInfo {
  version: string;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  dmgDownloadUrl: string | null;
  publishedAt: string;
}

export type UpdateCheckResult =
  | { status: "up-to-date"; currentVersion: string }
  | { status: "update-available"; currentVersion: string; release: ReleaseInfo }
  | { status: "error"; message: string };

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  assets: GitHubAsset[];
}

export function parseVersion(version: string): number[] {
  const cleaned = version.replace(/^v/, "");
  return cleaned.split(".").map((part) => {
    const n = parseInt(part, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  const len = Math.max(latestParts.length, currentParts.length);

  for (let i = 0; i < len; i++) {
    const l = latestParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export function findDmgAsset(assets: GitHubAsset[]): string | null {
  const dmg = assets.find(
    (a) => a.name.toLowerCase().endsWith(".dmg"),
  );
  return dmg?.browser_download_url ?? null;
}

function parseRelease(data: GitHubRelease): ReleaseInfo {
  return {
    version: data.tag_name.replace(/^v/, ""),
    tagName: data.tag_name,
    name: data.name,
    body: data.body,
    htmlUrl: data.html_url,
    dmgDownloadUrl: findDmgAsset(data.assets),
    publishedAt: data.published_at,
  };
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });

    if (!response.ok) {
      return { status: "error", message: `GitHub API returned ${response.status}` };
    }

    const data = (await response.json()) as GitHubRelease;
    const release = parseRelease(data);

    if (isNewerVersion(release.version, currentVersion)) {
      return { status: "update-available", currentVersion, release };
    }

    return { status: "up-to-date", currentVersion };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to check for updates";
    return { status: "error", message };
  }
}
