import { MarkdownEditorClient, type MarkdownEditorProps } from "@/components/markdown-editor-client";
import { uploadsEnabled } from "@/lib/upload-capability";

export function MarkdownEditor(props: MarkdownEditorProps) {
  return <MarkdownEditorClient {...props} uploadsEnabled={uploadsEnabled()} />;
}
