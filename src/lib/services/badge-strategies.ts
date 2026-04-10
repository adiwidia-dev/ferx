export type BadgeStrategyName =
  | "title-numeric"
  | "whatsapp-title"
  | "teams-title"
  | "outlook-folder-dom"
  | "unsupported";

export type BadgeStrategyKind =
  | "title-numeric"
  | "title-symbolic"
  | "dom-targeted"
  | "hybrid-title-dom"
  | "custom-script"
  | "unsupported";

type BadgeCapability = {
  kind: BadgeStrategyKind;
  usesMutationObserver: boolean;
  usesTitleObserver: boolean;
  usesFallbackPolling: boolean;
};

function matchesHostname(hostname: string, expectedHost: string): boolean {
  return hostname === expectedHost || hostname.endsWith(`.${expectedHost}`);
}

export function resolveBadgeStrategy(url: string): BadgeStrategyName {
  let hostname: string;

  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return "unsupported";
  }

  if (matchesHostname(hostname, "outlook.office.com")) {
    return "outlook-folder-dom";
  }

  if (matchesHostname(hostname, "teams.microsoft.com")) {
    return "teams-title";
  }

  if (matchesHostname(hostname, "whatsapp.com")) {
    return "whatsapp-title";
  }

  return "unsupported";
}

export function getBadgeCapability(
  strategy: BadgeStrategyName,
): BadgeCapability {
  switch (strategy) {
    case "outlook-folder-dom":
      return {
        kind: "dom-targeted",
        usesMutationObserver: true,
        usesTitleObserver: true,
        usesFallbackPolling: false,
      };
    case "teams-title":
    case "whatsapp-title":
      return {
        kind: "title-numeric",
        usesMutationObserver: false,
        usesTitleObserver: true,
        usesFallbackPolling: false,
      };
    default:
      return {
        kind: "unsupported",
        usesMutationObserver: false,
        usesTitleObserver: false,
        usesFallbackPolling: false,
      };
  }
}
