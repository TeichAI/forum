import { createElement } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { uploadsEnabled } from "@/lib/upload-capability";
import { isUploadThingUrl } from "@/lib/uploadthing-url";

const uploadThingImageFilter: Components = {
  img({ node, ...props }) {
    void node;
    if (typeof props.src === "string" && isUploadThingUrl(props.src)) return null;
    return createElement("img", props);
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={uploadsEnabled() ? undefined : uploadThingImageFilter}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
