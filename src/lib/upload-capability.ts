import "server-only";

export function uploadsEnabled() {
  return Boolean(process.env.UPLOADTHING_TOKEN?.trim());
}
