import { Fragment, type ReactElement } from "react";

/**
 * Zero-dependency renderer for the small markdown subset the chat
 * assistant actually produces (headers, **bold**, bullet lists,
 * paragraphs) — avoids pulling in a markdown library for one sidebar
 * panel. Not a general-purpose markdown parser; unsupported syntax
 * renders as literal text rather than being interpreted.
 */
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

export default function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactElement[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-0.5 pl-4">
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  lines.forEach((line, i) => {
    const heading = /^(#{1,3})\s+(.*)/.exec(line);
    const bullet = /^[*-]\s+(.*)/.exec(line);

    if (heading) {
      flushList();
      const level = heading[1].length;
      const content = renderInline(heading[2], `h-${i}`);
      blocks.push(
        <p key={`h-${i}`} className={level === 1 ? "font-semibold" : "font-medium"}>
          {content}
        </p>
      );
    } else if (bullet) {
      listItems.push(bullet[1]);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(<p key={`p-${i}`}>{renderInline(line, `p-${i}`)}</p>);
    }
  });
  flushList();

  return <div className="space-y-1.5">{blocks}</div>;
}
