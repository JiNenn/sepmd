import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

/**
 * Markdown Splitter & Copier
 * - 見出し # で分割（粒度 1/2/3）。
 * - 各セクションにコピー → 次セクションへゆっくりスクロール。
 * - コードブロックは独立コピー可。コピー時は色変化＋末尾を画面最下部に合わせる。
 */

type Part =
  | { type: "heading"; level: number; text: string }
  | { type: "text"; text: string }
  | { type: "code"; lang: string | null; code: string };

type Segment = {
  id: string;
  heading?: { level: number; text: string } | null;
  parts: Part[];
};

function App() {
  const [input, setInput] = useState<string>(DEFAULT_SAMPLE.trim());
  const [depth, setDepth] = useState<1 | 2 | 3>(3);
  const [segments, setSegments] = useState<Segment[]>([]);
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);
  const codeRefs = useRef<Record<string, HTMLPreElement | null>>({});
  const [copiedCodeIds, setCopiedCodeIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const toks = tokenize(input);
    const segs = toSegments(toks, depth);
    setSegments(segs);
    segRefs.current = [];
    codeRefs.current = {};
    setCopiedCodeIds({});
  }, [input, depth]);

  // ===== scroll utils =====
  const animateScrollTo = (targetY: number, duration = 650) => {
    const startY = window.scrollY;
    const diff = targetY - startY;
    if (Math.abs(diff) < 2) return;
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      window.scrollTo(0, startY + diff * ease(p));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const scrollBlockTopIntoView = (el: HTMLElement | null, offset = 12) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = window.scrollY + rect.top - offset;
    animateScrollTo(y, 600);
  };

  const scrollCodeBottomIntoView = (pre: HTMLElement | null) => {
    if (!pre) return;
    const rect = pre.getBoundingClientRect();
    const y = window.scrollY + rect.bottom - window.innerHeight;
    animateScrollTo(y, 550);
  };

  // ===== copy =====
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    }
  };

  const onCopySegment = async (idx: number) => {
    const seg = segments[idx];
    const text = segmentToMarkdown(seg);
    const ok = await copyText(text);
    if (!ok) return;
    const next = segRefs.current[idx + 1];
    if (next) {
      scrollBlockTopIntoView(next);
    } else {
      animateScrollTo(document.body.scrollHeight - window.innerHeight, 500);
    }
  };

  const onCopyCode = async (segId: string, partIdx: number, code: string) => {
    const ok = await copyText(code);
    if (!ok) return;
    const codeId = `${segId}#${partIdx}`;
    setCopiedCodeIds((m) => ({ ...m, [codeId]: true }));
    scrollCodeBottomIntoView(codeRefs.current[codeId] ?? null);
    setTimeout(() => {
      setCopiedCodeIds((m) => ({ ...m, [codeId]: false }));
    }, 1200);
  };

  return (
    <div>
      {/* 入力 & 設定 */}
      <div className="grid">
        <div className="card">
          <label>Markdown 入力</label>
          <textarea
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ここに生成AIの回答などを貼り付け"
          />
        </div>
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <label style={{ margin: 0 }}>分割粒度（# レベル）</label>
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value) as 1 | 2 | 3)}>
              <option value={1}>1 ( # )</option>
              <option value={2}>2 ( # / ## )</option>
              <option value={3}>3 ( # / ## / ### )</option>
            </select>
          </div>
          <ul className="tips">
            <li>コードブロック内の「#」は分割対象外。</li>
            <li>各枠の「コピー」でコピー → 次の枠へゆっくりスクロール。</li>
            <li>コードコピーは色が変わり、末尾を画面最下部に合わせます。</li>
          </ul>
        </div>
      </div>

      {/* 結果 */}
      <div style={{ marginTop: 16 }}>
        {segments.length === 0 ? (
          <p className="muted">分割対象がありません。</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {segments.map((seg, idx) => (
              <div key={seg.id} ref={(el) => (segRefs.current[idx] = el)} className="section">
                <div className="sec-head">
                  <div className="sec-meta">
                    セクション {idx + 1}
                    {seg.heading ? (
                      <>
                        <span> · </span>
                        <span>H{seg.heading.level}: </span>
                        <span style={{ fontWeight: 600, color: "#334155" }}>{seg.heading.text}</span>
                      </>
                    ) : null}
                  </div>
                  <button className="btn" onClick={() => onCopySegment(idx)}>コピー</button>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {seg.parts.map((p, j) => {
                    if (p.type === "text") {
                      return (
                        <div key={j} className="prose">
                          {p.text}
                        </div>
                      );
                    }
                    if (p.type === "heading") {
                      const cls = p.level === 1 ? "heading h1" : p.level === 2 ? "heading h2" : "heading h3";
                      const hashes = "#".repeat(p.level);
                      return (
                        <div key={j} className={cls}>
                          {hashes} {p.text}
                        </div>
                      );
                    }
                    // code
                    const codeId = `${seg.id}#${j}`;
                    const copied = !!copiedCodeIds[codeId];
                    return (
                      <div key={j} className="code-wrap">
                        <pre
                          ref={(el) => (codeRefs.current[codeId] = el)}
                          className={`code${copied ? " copied" : ""}`}
                        >{p.code}</pre>
                        <div className="code-foot">
                          <span className="code-label">{p.lang ? `コード (${p.lang})` : "コード"}</span>
                          <button className="btn" onClick={() => onCopyCode(seg.id, j, p.code)}>コピー</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer>Markdown splitter · no external deps · supports fenced code (```)</footer>
    </div>
  );
}

// ===== 解析: Markdown → トークン =====
function tokenize(md: string): Part[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: Part[] = [];
  let buf: string[] = [];

  const flushText = () => {
    if (buf.length) {
      const text = trimEmptyJoin(buf);
      if (text.length) out.push({ type: "text", text });
      buf = [];
    }
  };

  let inCode = false;
  let codeLang: string | null = null;
  let codeBuf: string[] = [];

  const openFence = /^\s*```(.*)$/;
  const closeFence = /^\s*```\s*$/;
  const headingRe = /^(#{1,6})\s+(.*)$/;

  for (const raw of lines) {
    const line = raw;

    if (!inCode && openFence.test(line)) {
      flushText();
      inCode = true;
      codeLang = (line.match(openFence)?.[1] ?? "").trim() || null;
      codeBuf = [];
      continue;
    }
    if (inCode) {
      if (closeFence.test(line)) {
        out.push({ type: "code", lang: codeLang, code: codeBuf.join("\n") });
        inCode = false;
        codeLang = null;
        codeBuf = [];
      } else {
        codeBuf.push(line);
      }
      continue;
    }

    const m = line.match(headingRe);
    if (m) {
      flushText();
      const level = m[1].length;
      const text = m[2].trim();
      out.push({ type: "heading", level, text });
    } else {
      buf.push(line);
    }
  }
  flushText();

  // 末尾で開いたままのコードブロックはテキスト扱い
  if (inCode && codeBuf.length) {
    out.push({ type: "text", text: "```\n" + codeBuf.join("\n") });
  }
  return out;
}

// ===== 見出し粒度でセグメント化 =====
function toSegments(parts: Part[], depth: 1 | 2 | 3): Segment[] {
  const segs: Segment[] = [];
  let cur: Segment | null = null;

  const startSeg = (heading: { level: number; text: string } | null) => {
    const id = `seg_${segs.length}_${Math.random().toString(36).slice(2, 8)}`;
    cur = { id, heading, parts: heading ? [{ type: "heading", level: heading.level, text: heading.text }] : [] };
    segs.push(cur);
  };

  for (const p of parts) {
    if (p.type === "heading" && p.level <= depth) {
      startSeg({ level: p.level, text: p.text });
      continue;
    }
    if (!cur) startSeg(null);
    cur!.parts.push(p);
  }
  return segs.filter((s) => s.parts.length > 0);
}

// ===== セグメント→Markdown =====
function segmentToMarkdown(seg: Segment): string {
  const lines: string[] = [];
  if (seg.heading) {
    lines.push("#".repeat(seg.heading.level) + " " + seg.heading.text);
  }
  for (const p of seg.parts) {
    if (p.type === "text") lines.push(p.text);
    else if (p.type === "heading") lines.push("#".repeat(p.level) + " " + p.text);
    else if (p.type === "code") {
      lines.push("```" + (p.lang ? p.lang : ""));
      lines.push(p.code);
      lines.push("```");
    }
  }
  return lines.join("\n").trim();
}

function trimEmptyJoin(lines: string[]): string {
  const joined = lines.join("\n");
  return joined
    .replace(/^\s*\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+\s*$/, "");
}

const DEFAULT_SAMPLE = `# サンプル: Markdown 分割デモ

本文は # の見出しで分割されます。粒度 3 を選ぶと ### までが分割対象です。

## 使い方
1. 左に Markdown を貼り付け
2. 粒度を選択 (1/2/3)
3. 右の枠に分割表示→各枠でコピー

### 注意点
- コードブロック内の # は無視されます。
- 枠のコピー後は次の枠へゆっくりスクロール。

## コードブロックの例
### JavaScript

\`\`\`js
function add(a,b){
  return a + b;
}
console.log(add(2,3));
\`\`\`

### Python

\`\`\`py
def fib(n):
  a,b=0,1
  for _ in range(n):
    a,b=b,a+b
  return a
print(fib(10))
\`\`\`

## 終わり
これでデモはおしまい。`;

createRoot(document.getElementById("root")!).render(<App />);
