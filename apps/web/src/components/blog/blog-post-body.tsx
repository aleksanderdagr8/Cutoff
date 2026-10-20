import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = node.props as { children?: ReactNode };
    return nodeToText(props.children);
  }
  return "";
}

function isExternalHref(href: string | undefined): boolean {
  if (!href) return false;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return (
    url.protocol === "http:" || url.protocol === "https:"
  ) && url.hostname !== "callcutoff.com" && url.hostname !== "www.callcutoff.com";
}

const components: Components = {
  a: ({ href, children }) => {
    const external = isExternalHref(href);
    return (
      <a
        href={href}
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => {
    const todo = /\bTODO\b/.test(nodeToText(children));
    if (!todo) return <blockquote>{children}</blockquote>;
    return (
      <blockquote className="blog-todo" role="note">
        {children}
      </blockquote>
    );
  },
  table: ({ children }) => (
    <div className="blog-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

/**
 * Renders a Markdown or MDX post body. Both `.md` and `.mdx` files are
 * treated as Markdown (GFM): headings, lists, links, and tables. Adding a
 * post does not require a component registry.
 */
export function BlogPostBody({ source }: { source: string }) {
  return (
    <div className="blog-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
