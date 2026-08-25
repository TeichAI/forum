export type ReplyTreeSource = {
  id: string;
  parentReplyId: string | null;
  createdAt: Date;
};

export type ReplyTreeNode<T extends ReplyTreeSource> = T & {
  childReplies: ReplyTreeNode<T>[];
};

export type DisplayReply<T extends ReplyTreeSource> = {
  reply: T;
  parentReply: T | null;
  depth: number;
};

function chronological<T extends ReplyTreeSource>(left: T, right: T) {
  const timeDifference = left.createdAt.getTime() - right.createdAt.getTime();
  return timeDifference || left.id.localeCompare(right.id);
}

export function buildReplyTree<T extends ReplyTreeSource>(replies: T[]): ReplyTreeNode<T>[] {
  const nodes = new Map(replies.map((reply) => [reply.id, { ...reply, childReplies: [] as ReplyTreeNode<T>[] }]));
  const roots: ReplyTreeNode<T>[] = [];

  for (const reply of [...replies].sort(chronological)) {
    const node = nodes.get(reply.id)!;
    const parent = reply.parentReplyId ? nodes.get(reply.parentReplyId) : undefined;
    if (parent && parent.id !== node.id) parent.childReplies.push(node);
    else roots.push(node);
  }

  return roots;
}

export function flattenReplyTree<T extends ReplyTreeSource>(roots: ReplyTreeNode<T>[]): DisplayReply<T>[] {
  const flattened: DisplayReply<T>[] = [];
  const visit = (node: ReplyTreeNode<T>, parentReply: T | null, depth: number) => {
    flattened.push({ reply: node, parentReply, depth });
    for (const child of node.childReplies) visit(child, node, depth + 1);
  };
  for (const root of roots) visit(root, null, 0);
  return flattened;
}

export function replyIndentLevels(depth: number) {
  const normalizedDepth = Math.max(0, Math.floor(depth));
  return { desktop: Math.min(normalizedDepth, 4), mobile: Math.min(normalizedDepth, 2) };
}
