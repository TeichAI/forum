import { deleteReply, deleteThread, updateReply, updateThread } from "@/actions/forum";
import { MarkdownEditor } from "@/components/markdown-editor";
import { SubmitButton } from "@/components/ui/submit-button";

export function ContentMenu({ type, id, body, title }: { type: "thread" | "reply"; id: string; body: string; title?: string }) {
  const update = type === "thread" ? updateThread : updateReply;
  const remove = type === "thread" ? deleteThread : deleteReply;
  const idName = type === "thread" ? "threadId" : "replyId";
  return <details className="relative"><summary className="list-none cursor-pointer text-xs font-semibold muted">Edit</summary><div className="card fixed inset-x-3 top-20 z-50 mx-auto max-h-[calc(100vh-7rem)] max-w-2xl overflow-y-auto p-5 shadow-2xl sm:p-7"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">Edit {type}</h2><span className="text-xs muted">Close with the browser back button or Edit toggle</span></div><form action={update} className="space-y-4"><input type="hidden" name={idName} value={id} />{type === "thread" && <div><label className="label">Title</label><input className="input" name="title" defaultValue={title} minLength={5} maxLength={160} required /></div>}<MarkdownEditor initialValue={body} rows={7} /><div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Save changes</SubmitButton></div></form><hr className="divider my-5" /><form action={remove}><input type="hidden" name={idName} value={id} /><p className="mb-3 text-sm muted">Deletion hides this {type} from the community while preserving the moderation record.</p><SubmitButton className="button button-danger" pendingLabel="Deleting…">Delete {type}</SubmitButton></form></div></details>;
}
