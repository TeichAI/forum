import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const f = createUploadthing();

export const ourFileRouter = {
  imageUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => {
      const user = await requireUser();
      if (!user) throw new UploadThingError("Unauthorized");
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const attachment = await db.attachment.create({
        data: { userId: metadata.userId, key: file.key, url: file.ufsUrl, name: file.name, size: file.size, context: "DRAFT" },
      });
      return { id: attachment.id, url: attachment.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
