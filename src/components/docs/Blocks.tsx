import type { ReactNode } from "react";
import type { PdfBlock } from "@/lib/docs/pdf";

/** Renders documentation blocks (same data the PDF uses) as web content. */
export function Blocks({ blocks }: { blocks: PdfBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: PdfBlock }): ReactNode {
  switch (block.type) {
    case "h2":
      return (
        <h3 className="mt-8 border-b border-zinc-800 pb-1.5 text-lg font-bold text-white">
          {block.text}
        </h3>
      );
    case "h3":
      return <h4 className="mt-6 text-[15px] font-semibold text-zinc-100">{block.text}</h4>;
    case "p":
      return <p className="text-sm leading-relaxed text-zinc-300">{block.text}</p>;
    case "bullet":
      return (
        <li className="ml-5 list-disc text-sm leading-relaxed marker:text-zinc-600">
          {block.text}
        </li>
      );
    case "note":
      return (
        <div className="rounded-lg border-l-4 border-violet-500 bg-violet-500/10 px-4 py-3 text-sm leading-relaxed text-zinc-300">
          {block.text}
        </div>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-200">
          <code>{block.lines.join("\n")}</code>
        </pre>
      );
    default:
      return null;
  }
}

/** Wraps consecutive bullet blocks in a list for valid HTML. */
export function BlocksWithLists({ blocks }: { blocks: PdfBlock[] }) {
  const out: ReactNode[] = [];
  let bullets: PdfBlock[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="space-y-2">
          {bullets.map((bl, i) => (
            <Block key={i} block={bl} />
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const block of blocks) {
    if (block.type === "bullet") {
      bullets.push(block);
    } else {
      flush();
      out.push(<Block key={`${block.type}-${out.length}`} block={block} />);
    }
  }
  flush();
  return <div className="space-y-4">{out}</div>;
}
