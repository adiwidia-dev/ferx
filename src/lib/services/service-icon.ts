export function getServiceMonogram(name: string): string {
  const match = name.trim().match(/[A-Za-z0-9]/);
  return match ? match[0].toUpperCase() : "?";
}

export function getServiceFaviconUrl(url: string): string {
  try {
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(new URL(url).toString())}`;
  } catch {
    return "https://www.google.com/s2/favicons?sz=64&domain=localhost";
  }
}
