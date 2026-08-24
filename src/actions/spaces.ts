"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

const spaceSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(60, "Names must be 60 characters or fewer."),
  description: z.string().trim().min(2, "Enter at least 2 characters.").max(280, "Descriptions must be 280 characters or fewer."),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid color."),
});

export type SpaceActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"name" | "description" | "color", string>>;
};

function availableSlug(name: string, occupied: Set<string>) {
  const base = slugify(name) || "space";
  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? "" : `-${number}`;
    const candidate = `${base.slice(0, 72 - suffix.length)}${suffix}`;
    if (!occupied.has(candidate)) return candidate;
  }
}

export async function createSpace(_state: SpaceActionState, formData: FormData): Promise<SpaceActionState> {
  await requireAdmin();
  const parsed = spaceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    color: formData.get("color"),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        name: errors.name?.[0],
        description: errors.description?.[0],
        color: errors.color?.[0],
      },
    };
  }

  const baseSlug = slugify(parsed.data.name) || "space";
  const [matchingSpaces, lastPosition] = await Promise.all([
    db.category.findMany({
      where: {
        OR: [
          { name: { equals: parsed.data.name, mode: "insensitive" } },
          { slug: { startsWith: baseSlug } },
        ],
      },
      select: { name: true, slug: true },
    }),
    db.category.aggregate({ _max: { position: true } }),
  ]);

  if (matchingSpaces.some((space) => space.name.toLocaleLowerCase() === parsed.data.name.toLocaleLowerCase())) {
    return { status: "error", message: "A space with that name already exists.", fieldErrors: { name: "Choose another name." } };
  }

  const slug = availableSlug(parsed.data.name, new Set(matchingSpaces.map((space) => space.slug)));
  try {
    await db.category.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        color: parsed.data.color.toLowerCase(),
        slug,
        position: (lastPosition._max.position ?? -1) + 1,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { status: "error", message: "That space name or URL is already in use.", fieldErrors: { name: "Choose another name." } };
    }
    return { status: "error", message: "We couldn’t create the space. Please try again." };
  }

  revalidatePath("/");
  redirect(`/c/${slug}`);
}
