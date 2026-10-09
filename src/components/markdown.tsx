"use client";
import { useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setError(false); setTimeout(() => setCopied(false), 1800); }
    catch { setError(true); }
  }
  return <button type="button" className="copy-button" onClick={copy} aria-label={copied ? "Copied" : label} title={error ? "Clipboard unavailable. Select and copy the text." : label}>{copied ? <Check size={14} /> : <Copy size={14} />}<span>{error ? "Select to copy" : copied ? "Copied" : label}</span></button>;
}
function Code({ children, className, ...props }: ComponentPropsWithoutRef<"code">) {
  const language = /language-(\w+)/.exec(className || "")?.[1];
  const text = String(children).replace(/\n$/, "");
  if (!language && !text.includes("\n")) return <code className={className} {...props}>{children}</code>;
  return <div className="code-block"><div className="code-toolbar"><span>{language || "code"}</span><CopyButton text={text} label="Copy code" /></div><pre><code className={className} {...props}>{children}</code></pre></div>;
}
export function Markdown({ content }: { content: string }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    code: Code,
    pre: ({ children }) => <div className="pre-container">{children}</div>,
    a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
    table: ({ children, ...props }) => <div className="table-scroll"><table {...props}>{children}</table></div>,
    img: () => <span>[Image omitted]</span>,
  }}>{content}</ReactMarkdown></div>;
}
