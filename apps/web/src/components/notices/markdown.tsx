import { Fragment, type ReactNode } from 'react';

/**
 * Tiny, safe markdown for notices: **bold**, *italic*, "- " lists, links and bare URLs, line
 * breaks. Builds React elements (never innerHTML), so author text can't inject markup.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let list: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{para.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l)}</Fragment>)}</p>);
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="list-disc pl-5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of lines) {
    const item = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      list.push(item[1]!);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className={className ?? 'flex flex-col gap-3 text-body leading-relaxed'}>{blocks}</div>;
}

const TOKEN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+)/g;

function inline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    const url = link?.[2] ?? (/^https?:\/\//.test(part) ? part.replace(/[.,;:!?)]+$/, '') : null);
    if (url) {
      const trailing = link ? '' : part.slice(url.length);
      return (
        <Fragment key={i}>
          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-strong underline underline-offset-2">{link?.[1] ?? url}</a>
          {trailing}
        </Fragment>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
