"use client";

import { useState } from "react";

export type ConnectClient = "claude" | "chatgpt" | "cursor" | "grok" | "raw";

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
  { id: "grok", label: "Grok" },
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

  const grokCli = `export CK_LIVE="${key}"
grok mcp add --transport http cutoff ${MCP_URL} \\
  --header "Authorization: Bearer \${CK_LIVE}"`;

  const grokToml = `[mcp_servers.cutoff]
url = "${MCP_URL}"
headers = { Authorization = "Bearer \${CK_LIVE}" }`;

  const grokApi = `{
  "type": "mcp",
  "server_url": "${MCP_URL}",
  "server_label": "cutoff",
  "authorization": "${key}"
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
      <div
        role="tablist"
        aria-label="Assistant snippets"
        className="mt-4 flex flex-wrap gap-2 border-b border-hairline pb-3"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected === tab.id}
            data-client={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`rounded-control px-4 py-2 text-[14px] transition-colors duration-160 ease-out ${
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

      {selected === "grok" ? (
        <div className="mt-5">
          <p className="text-[15px] leading-relaxed text-ink">
            Same MCP endpoint as the other assistants. xAI remote MCP sends{" "}
            <span className="font-mono text-[13px]">Authorization: Bearer …</span>{" "}
            natively — no{" "}
            <span className="font-mono text-[13px]">mcp-remote</span> bridge.
          </p>

          <p className="mt-4 text-[15px] font-medium text-ink">grok.com chat</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink">
            Connectors → New Connector → Custom → URL{" "}
            <span className="font-mono text-[13px]">{MCP_URL}</span>, then
            complete authentication. If Grok asks for a token or API key, paste
            this household key. Cutoff does not offer OAuth yet — if the
            connector UI only accepts OAuth and will not take a static Bearer,
            use the CLI or API below (those paths are documented for Bearer
            today).
          </p>
          <SnippetBlock label="Server URL" value={MCP_URL} />
          <p className="mt-3 text-[13px] text-secondary">
            Auth:{" "}
            <span className="font-mono">Authorization: Bearer {key}</span>
          </p>

          <p className="mt-6 text-[15px] font-medium text-ink">Grok CLI</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink">
            Install the Grok CLI, export the key, then add the server (or paste
            the TOML into{" "}
            <span className="font-mono text-[13px]">~/.grok/config.toml</span>
            ).
          </p>
          <SnippetBlock label="grok mcp add" value={grokCli} />
          <SnippetBlock label="config.toml" value={grokToml} />

          <p className="mt-6 text-[15px] font-medium text-ink">
            Responses API / SDK
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink">
            Put this tool object in{" "}
            <span className="font-mono text-[13px]">tools</span> on{" "}
            <span className="font-mono text-[13px]">
              POST https://api.x.ai/v1/responses
            </span>
            . The{" "}
            <span className="font-mono text-[13px]">authorization</span> field
            becomes the Bearer token Cutoff expects.
          </p>
          <SnippetBlock label="tools[] entry" value={grokApi} />
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
    case "grok":
      return "Grok";
    case "raw":
      return "agent";
  }
}
