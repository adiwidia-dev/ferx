export type BadgeStrategyName =
  | "title-numeric"
  | "whatsapp-dom"
  | "telegram-dom"
  | "google-chat-dom"
  | "teams-dom"
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

  if (
    hostname === "outlook.office.com" ||
    hostname === "outlook.live.com" ||
    hostname === "office.com" ||
    hostname === "www.office.com"
  ) {
    return "outlook-folder-dom";
  }

  if (
    matchesHostname(hostname, "teams.microsoft.com") ||
    matchesHostname(hostname, "teams.cloud.microsoft")
  ) {
    return "teams-dom";
  }

  if (matchesHostname(hostname, "web.whatsapp.com")) {
    return "whatsapp-dom";
  }

  if (matchesHostname(hostname, "web.telegram.org")) {
    return "telegram-dom";
  }

  if (matchesHostname(hostname, "chat.google.com")) {
    return "google-chat-dom";
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
        usesFallbackPolling: true,
      };
    case "teams-dom":
      return {
        kind: "hybrid-title-dom",
        usesMutationObserver: true,
        usesTitleObserver: true,
        usesFallbackPolling: true,
      };
    case "whatsapp-dom":
    case "telegram-dom":
    case "google-chat-dom":
      return {
        kind: "custom-script",
        usesMutationObserver: true,
        usesTitleObserver: true,
        usesFallbackPolling: true,
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
