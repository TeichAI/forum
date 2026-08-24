export function isUploadThingUrl(value: string) {
  try {
    const { hostname, protocol } = new URL(value);
    return protocol === "https:" && (hostname === "utfs.io" || hostname === "ufs.sh" || hostname.endsWith(".ufs.sh"));
  } catch {
    return false;
  }
}
