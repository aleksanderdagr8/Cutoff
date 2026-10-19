"use client";

import { useState } from "react";

export type ConnectClient = "claude" | "chatgpt" | "cursor" | "raw";

const MCP_URL = "https://mcp.callcutoff.com/mcp";

type Props = {
  /** One-time secret; snippets use a placeholder when null. */
  secret: string | null;
  selected: ConnectClient;
  onSelect: (client: ConnectClient) => void;
};

function PlaceholderKey({ secret }: { secret: string | null }) {
  return secret ?? "ck_live_…";
}

function SnippetBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] text-secondary">{label}</p>
        <button
          type="button"
          className="text-[13px] text-accent underline-offset-2 hover:underline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-control border border-hairline bg-surface px-4 py-3 font-mono text-[12px] leading-relaxed text-ink">
        {value}
      </pre>
    </div>
  );
}

const TABS: { id: ConnectClient; label: string }[] = [
  { id: "claude", label: "Claude" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "cursor", label: "Cursor" },
  { id: "raw", label: "Raw API" },
];

export function ConnectSnippets({ secret, selected, onSelect }: Props) {
  const key = PlaceholderKey({ secret });

  const claudeJson = `{
  "mcpServers": {
    "cutoff": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "${MCP_URL}",
        "--header",
        "Authorization:Bearer \${CUTOFF_KEY}"
      ],
      "env": { "CUTOFF_KEY": "${key}" }
    }
  }
}`;

  const cursorJson = `{
  "mcpServers": {
    "cutoff": {
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer ${key}" }
    }
  }
}`;

  const curl = `curl -sS -X POST ${MCP_URL} \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

  return (
    <div className="mt-8">
      <p className="text-[15px] text-secondary">
        Copy a snippet for your assistant. Paste the key only where the snippet
        shows it — never into browser storage.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 border-b border-hairline pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`rounded-control px-3 py-1.5 text-[14px] transition-colors duration-160 ease-out ${
              selected === tab.id
                ? "bg-accent/[0.09] font-medium text-accent"
                : "text-secondary hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {selected === "claude" ? (
        <div className="mt-5">
          <p className="text-[15px] leading-relaxed text-ink">
            Claude.ai / Desktop: Settings → Connectors → Add custom connector,
            URL{" "}
            <span className="font-mono text-[13px]">{MCP_URL}</span>. Until
            OAuth lands, Desktop uses the{" "}
            <span className="font-mono text-[13px]">mcp-remote</span> bridge
            below.
          </p>
          <SnippetBlock label="claude_desktop_config / bridge" value={claudeJson} />
        </div>
      ) : null}

      {selected === "chatgpt" ? (
        <div className="mt-5">
          <p className="text-[15px] leading-relaxed text-ink">
            ChatGPT: Settings → Connectors → Advanced → Developer mode → Create,
            with MCP URL{" "}
            <span className="font-mono text-[13px]">{MCP_URL}</span>. Full
            write actions need OAuth (later). Plus/Pro/Business only.
          </p>
          <SnippetBlock label="Server URL" value={MCP_URL} />
          <p className="mt-3 text-[13px] text-secondary">
            Auth header:{" "}
            <span className="font-mono">Authorization: Bearer {key}</span>
          </p>
        </div>
      ) : null}

      {selected === "cursor" ? (
        <div className="mt-5">
          <p className="text-[15px] leading-relaxed text-ink">
            Cursor: add to{" "}
            <span className="font-mono text-[13px]">~/.cursor/mcp.json</span>.
          </p>
          <SnippetBlock label="mcp.json" value={cursorJson} />
        </div>
      ) : null}

      {selected === "raw" ? (
        <div className="mt-5">
          <p className="text-[15px] leading-relaxed text-ink">
            Call the MCP endpoint directly, or point your agent webhook at
            Cutoff for due nudges (settings below).
          </p>
          <SnippetBlock label="tools/list" value={curl} />
        </div>
      ) : null}
    </div>
  );
}

export function connectClientLabel(client: ConnectClient): string {
  switch (client) {
    case "claude":
      return "Claude";
    case "chatgpt":
      return "ChatGPT";
    case "cursor":
      return "Cursor";
    case "raw":
      return "agent";
  }
}
