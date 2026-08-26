import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const f = createUploadthing();

function uploadMiddleware() {
  return async () => {
    const user = await requireUser();
    if (!user) throw new UploadThingError("Unauthorized");
    return { userId: user.id };
  };
}

export const ourFileRouter = {
  imageUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1, acl: "public-read" } })
    .middleware(uploadMiddleware())
    .onUploadComplete(async ({ metadata, file }) => {
      const attachment = await db.attachment.create({
        data: { userId: metadata.userId, key: file.key, url: file.ufsUrl, name: file.name, size: file.size, access: "PUBLIC", context: "DRAFT" },
      });
      return { id: attachment.id, url: attachment.url };
    }),
  mailImageUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1, acl: "private" } })
    .middleware(uploadMiddleware())
    .onUploadComplete(async ({ metadata, file }) => {
      const attachment = await db.attachment.create({
        data: { userId: metadata.userId, key: file.key, url: file.ufsUrl, name: file.name, size: file.size, access: "PRIVATE", context: "DRAFT" },
      });
      return { id: attachment.id, url: `/api/attachments/${attachment.id}` };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
