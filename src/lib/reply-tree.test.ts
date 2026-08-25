import { describe, expect, it } from "vitest";
import { buildReplyTree, flattenReplyTree, replyIndentLevels } from "./reply-tree";

const at = (minute: number) => new Date(`2026-08-25T12:${String(minute).padStart(2, "0")}:00Z`);

describe("reply trees", () => {
  it("orders roots and siblings chronologically while displaying branches depth-first", () => {
    const replies = [
      { id: "later-root", parentReplyId: null, createdAt: at(5) },
      { id: "second-child", parentReplyId: "root", createdAt: at(4) },
      { id: "deep-child", parentReplyId: "first-child", createdAt: at(3) },
      { id: "root", parentReplyId: null, createdAt: at(0) },
      { id: "first-child", parentReplyId: "root", createdAt: at(2) },
    ];

    expect(flattenReplyTree(buildReplyTree(replies)).map(({ reply, depth }) => [reply.id, depth])).toEqual([
      ["root", 0], ["first-child", 1], ["deep-child", 2], ["second-child", 1], ["later-root", 0],
    ]);
  });

  it("keeps orphaned replies visible as roots and caps only their visual indentation", () => {
    const orphan = { id: "orphan", parentReplyId: "hard-deleted", createdAt: at(0) };
    expect(buildReplyTree([orphan])[0].id).toBe("orphan");
    expect(replyIndentLevels(8)).toEqual({ desktop: 4, mobile: 2 });
    expect(replyIndentLevels(-1)).toEqual({ desktop: 0, mobile: 0 });
  });
});
