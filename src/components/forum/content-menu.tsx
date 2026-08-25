import { deleteReply, deleteThread, updateReply, updateThread } from "@/actions/forum";
import { MarkdownEditor } from "@/components/markdown-editor";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import { RateLimitForm } from "@/components/ui/rate-limit-form";

export function ContentMenu({ type, id, body, title }: { type: "thread" | "reply"; id: string; body: string; title?: string }) {
  const update = type === "thread" ? updateThread : updateReply;
  const remove = type === "thread" ? deleteThread : deleteReply;
  const idName = type === "thread" ? "threadId" : "replyId";
  return (
    <EditorDialog title={`Edit ${type}`}>
      <RateLimitForm action={update} className="space-y-4">
        <input type="hidden" name={idName} value={id} />
        {type === "thread" && (
          <div>
            <label className="label">Title</label>
            <input className="input" name="title" defaultValue={title} minLength={5} maxLength={160} required />
          </div>
        )}
        <MarkdownEditor initialValue={body} rows={7} />
        <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Save changes</SubmitButton></div>
      </RateLimitForm>
      <hr className="divider my-5" />
      <RateLimitForm action={remove}>
        <input type="hidden" name={idName} value={id} />
        <p className="mb-3 text-sm muted">Deletion hides this {type} from the community while preserving the moderation record.</p>
        <SubmitButton className="button button-danger" pendingLabel="Deleting…">Delete {type}</SubmitButton>
      </RateLimitForm>
    </EditorDialog>
  );
}
