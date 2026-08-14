import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Shared with admin-api (discord_webhooks.py) and the Discord bot
// (ops-control-bot cogs/releases.py). Keep in sync by contract.
const DISCORD_BUDGET = 1000;

export function formatNotesForDiscord(md, limit = DISCORD_BUDGET) {
  const lines = [];
  for (const raw of (md || '').split('\n')) {
    const s = raw.trim();
    if (!s) continue;
    if (s.startsWith('### ')) lines.push(`**${s.slice(4).trim()}**`);
    else if (s.startsWith('## ')) lines.push(`**${s.slice(3).trim()}**`);
    else if (s.startsWith('# ')) lines.push(`**${s.slice(2).trim()}**`);
    else if (s.startsWith('> ')) lines.push(s.slice(2).trim());
    else lines.push(s);
  }
  let text = lines.join('\n');
  if (text.length > limit) text = text.slice(0, limit).trimEnd() + '\u2026';
  return text;
}

export default function ReleaseNotesEditor({ value, onChange }) {
  const discord = useMemo(() => formatNotesForDiscord(value), [value]);
  const over = discord.length > DISCORD_BUDGET;
  const [copied, setCopied] = useState(false);

  const copyForGitHub = async () => {
    try {
      await navigator.clipboard.writeText(value || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions); fall back to select-all hint.
      setCopied(false);
    }
  };

  return (
    <div className="release-notes-editor">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'## Summary\nA short paragraph about this release.\n\n## Highlights\n- One thing\n- Another thing'}
        rows={10}
      />

      <div className="rne-toolbar">
        <button type="button" className="btn" onClick={copyForGitHub}>
          {copied ? 'Copied!' : 'Copy for GitHub'}
        </button>
        <span className={`rne-count ${over ? 'rne-count-over' : ''}`}>
          Discord preview: {discord.length} / {DISCORD_BUDGET} chars{over ? ' - will be truncated with \u2026' : ''}
        </span>
      </div>

      <div className="rne-grid">
        <div className="rne-pane">
          <div className="rne-pane-title">WEBSITE PREVIEW</div>
          <div className="rne-website-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {value || '_Nothing to preview yet._'}
            </ReactMarkdown>
          </div>
        </div>
        <div className="rne-pane">
          <div className="rne-pane-title">DISCORD PREVIEW</div>
          <div className="rne-discord-preview">
            <div className="rne-discord-embed">
              <div className="rne-discord-title">OPS ROOM vX.Y.Z Released</div>
              <div className="rne-discord-body">
                {discord || '*Nothing to preview yet.*'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
