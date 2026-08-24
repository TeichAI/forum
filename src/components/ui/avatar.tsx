import Image from "next/image";
import { cn } from "@/lib/utils";

export function Avatar({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  if (src) return <Image className={cn("avatar", className)} src={src} alt="" width={80} height={80} />;
  return <span className={cn("avatar avatar-fallback", className)} aria-hidden>{name.slice(0, 1).toUpperCase()}</span>;
}
