"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, Check, ChevronDown, Code2, Download, Lightbulb, LoaderCircle, LogOut, Menu, MessageSquare, Moon, PanelLeftClose, PenLine, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Square, Sun, Trash2, X } from "lucide-react";
import { getContext, MAX_MESSAGE_LENGTH, readChatStream, type Conversation, type Message } from "@/lib/chat";
import { MAX_CONVERSATIONS, newConversation, parseConversations, STORAGE_KEY, THEME_KEY } from "@/lib/storage";
import { CopyButton, Markdown } from "./markdown";

type Config = { authenticated: boolean; passwordConfigured: boolean; ready: boolean; model: string };
const EMPTY_MESSAGES: Message[] = [];
type State = { chats: Conversation[]; active: string | null; loaded: boolean };
type Action = { type: "load"; chats: Conversation[] } | { type: "select"; id: string | null } | { type: "save"; chat: Conversation } | { type: "delete"; id: string };
function reducer(state: State, action: Action): State {
  if (action.type === "load") return { chats: action.chats, active: null, loaded: true };
  if (action.type === "select") return { ...state, active: action.id };
  if (action.type === "delete") return { ...state, chats: state.chats.filter(c => c.id !== action.id), active: state.active === action.id ? null : state.active };
  return { ...state, active: action.chat.id, chats: [action.chat, ...state.chats.filter(c => c.id !== action.chat.id)].slice(0, MAX_CONVERSATIONS) };
}
function NovaMark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 2c1.7 9.3 4.7 12.3 14 14-9.3 1.7-12.3 4.7-14 14C14.3 20.7 11.3 17.7 2 16 11.3 14.3 14.3 11.3 16 2Z" fill="currentColor"/><path d="M25 1c.5 2.8 1.5 3.8 4.3 4.3C26.5 5.8 25.5 6.8 25 9.6c-.5-2.8-1.5-3.8-4.3-4.3C23.5 4.8 24.5 3.8 25 1Z" fill="currentColor"/></svg>;
}
const suggestions = [
  { icon: PenLine, title: "Find the right words", description: "A first draft, a fresh perspective", prompt: "Help me write a thoughtful, professional email. Ask me what it's about first.", color: "peach" },
  { icon: Code2, title: "Build something great", description: "Untangle code. Bring ideas to life.", prompt: "Be my coding partner. Ask me what I want to build and help me plan it step by step.", color: "sage" },
  { icon: Lightbulb, title: "Follow your curiosity", description: "Big questions, simple explanations", prompt: "Teach me something fascinating about a topic of my choice. Ask me what I'm curious about.", color: "yellow" },
  { icon: BookOpen, title: "Make room for ideas", description: "Brainstorm your next possibility", prompt: "Help me brainstorm fresh ideas. Start by asking me about my goal and constraints.", color: "lavender" },
];

export default function ChatApp() {
  const [state, dispatch] = useReducer(reducer, { chats: [], active: null, loaded: false });
  const [config, setConfig] = useState<Config | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [dark, setDark] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [settings, setSettings] = useState(false);
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const abortController = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const activeChat = state.chats.find(c => c.id === state.active);
  const messages = activeChat?.messages || EMPTY_MESSAGES;
  const loadConfig = useCallback(async () => {
    try { const response = await fetch("/api/session", { cache: "no-store" }); if (!response.ok) throw new Error("Unable to connect. Please refresh the page."); setConfig(await response.json()); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to connect."); }
  }, []);
  useEffect(() => {
    try { dispatch({ type: "load", chats: parseConversations(localStorage.getItem(STORAGE_KEY)) }); const theme = localStorage.getItem(THEME_KEY); queueMicrotask(() => setDark(theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches)); }
    catch { dispatch({ type: "load", chats: [] }); queueMicrotask(() => setStorageError(true)); }
    void loadConfig(); return () => abortController.current?.abort();
  }, [loadConfig]);
  useEffect(() => {
    if (!state.loaded || streaming) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.chats)); } catch { queueMicrotask(() => setStorageError(true)); }
  }, [state.chats, state.loaded, streaming]);
  useEffect(() => { if (atBottom) scrollArea.current?.scrollTo({ top: scrollArea.current.scrollHeight, behavior: streaming ? "instant" : "smooth" }); }, [messages, streaming, atBottom]);
  const startNew = useCallback(() => {
    if (inFlight.current) return;
    dispatch({ type: "select", id: null }); setDraft(""); setError(null); setSidebar(false); setRenaming(false); setAtBottom(true); textarea.current?.focus();
  }, []);
  useEffect(() => {
    function keys(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSidebar(true); searchInput.current?.focus(); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "o") { event.preventDefault(); startNew(); }
      if (event.key === "Escape") { setSidebar(false); setSettings(false); setDeleteId(null); setRenaming(false); }
    }
    window.addEventListener("keydown", keys); return () => window.removeEventListener("keydown", keys);
  }, [startNew]);
  function toggleTheme() { const next = !dark; setDark(next); try { localStorage.setItem(THEME_KEY, next ? "dark" : "light"); } catch { setStorageError(true); } }
  async function send(text: string, retry = false) {
    if (inFlight.current || !text.trim() || !state.loaded) return;
    if (text.trim().length > MAX_MESSAGE_LENGTH) { setError("Please keep your message under 8,000 characters."); return; }
    inFlight.current = true;
    const chat = activeChat || newConversation();
    let previous = chat.messages;
    if (retry) previous = previous.slice(0, previous.findLastIndex(m => m.role === "user"));
    const user: Message = { id: crypto.randomUUID(), role: "user", content: text.trim(), status: "complete" };
    const assistant: Message = { id: crypto.randomUUID(), role: "assistant", content: "", status: "stopped" };
    const outgoing = [...previous, user];
    const updated: Conversation = { ...chat, title: chat.messages.length ? chat.title : text.trim().slice(0, 65), updatedAt: Date.now(), messages: [...outgoing, assistant] };
    dispatch({ type: "save", chat: updated }); setDraft(""); setError(null); setStreaming(true); setAtBottom(true);
    const controller = new AbortController(); abortController.current = controller;
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: getContext(outgoing) }), signal: controller.signal });
      if (!response.ok) { if (response.status === 401) void loadConfig(); const data = await response.json().catch(() => ({})); throw new Error(data.error || "Couldn't send the message. Please retry."); }
      if (!response.body) throw new Error("The server returned an empty response.");
      await readChatStream(response.body, delta => { assistant.content += delta; dispatch({ type: "save", chat: { ...updated, messages: [...outgoing, { ...assistant }] } }); });
      assistant.status = "complete";
    } catch (err) { assistant.status = controller.signal.aborted ? "stopped" : "error"; if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Something went wrong. Please retry."); }
    finally { dispatch({ type: "save", chat: { ...updated, messages: [...outgoing, { ...assistant }] } }); setStreaming(false); inFlight.current = false; abortController.current = null; textarea.current?.focus(); }
  }
  async function signIn(event: FormEvent) {
    event.preventDefault(); setSigningIn(true); setError(null);
    try { const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setPassword(""); await loadConfig(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not sign in."); } finally { setSigningIn(false); }
  }
  function exportChat() {
    if (!activeChat) return;
    const text = `# ${activeChat.title}\n\n` + messages.map(m => `## ${m.role === "user" ? "You" : "Nova"}\n\n${m.content}${m.status && m.status !== "complete" ? `\n\n[${m.status}]` : ""}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "nova-conversation.md"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filtered = state.chats.filter(c => `${c.title} ${c.messages.map(m => m.content).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const lastAssistant = messages.at(-1);
  const lastUser = messages.findLast(m => m.role === "user");

  return <div className={`app ${dark ? "dark-theme" : ""}`}>
    {sidebar && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`} aria-label="Chat navigation">
      <div className="sidebar-brand"><span className="brand-mark"><NovaMark /></span><span className="brand-name">nova<span className="brand-dot">.</span></span><button className="icon-button sidebar-close" title="Close navigation" aria-label="Close navigation" onClick={() => setSidebar(false)}><PanelLeftClose size={18} /></button></div>
      <button className="new-chat" onClick={startNew} disabled={streaming}><Plus size={18} /><span>New conversation</span><span className="key-hint">⌘ ⇧ O</span></button>
      <label className="search-box"><Search size={16} /><input ref={searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your chats" aria-label="Search conversations" /><kbd>⌘ K</kbd></label>
      <div className="history-heading"><span>YOUR CONVERSATIONS</span><span>{state.chats.length}</span></div>
      <nav className="chat-history">{!filtered.length && <div className="empty-history"><MessageSquare size={23} /><p>{search ? "No conversations found" : "A fresh start."}</p><span>{search ? "Try another search." : "Your conversations will appear here."}</span></div>}{filtered.map(chat => <div key={chat.id} className={`history-row ${state.active === chat.id ? "selected" : ""}`}><button onClick={() => { if (streaming) return; dispatch({ type: "select", id: chat.id }); setSidebar(false); setError(null); setRenaming(false); setAtBottom(true); setDraft(""); }} disabled={streaming} title={chat.title}><MessageSquare size={15} /><span>{chat.title}</span></button><button className="delete-chat" aria-label={`Delete ${chat.title}`} title="Delete conversation" disabled={streaming} onClick={() => setDeleteId(chat.id)}><Trash2 size={14} /></button></div>)}</nav>
      <div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={16} /><span>A space for your thoughts.<br/><small>History saved on this browser.</small></span></div><button className="profile-button" onClick={() => setSettings(true)}><span className="profile-avatar">Y</span><span>Your workspace<small>Personal space</small></span><Settings2 size={17} /></button></div>
    </aside>
    <div className="main-panel">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebar(true)}><Menu size={20} /></button><span className="topbar-title">{activeChat ? "Conversation" : "Your everyday AI companion"}</span></div><div className="topbar-right"><span className="private-badge"><ShieldCheck size={13} />Personal workspace</span><button className="icon-button" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Light theme" : "Dark theme"} onClick={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button></div></header>
      {config && !config.authenticated ? <div className="login-screen"><div className="welcome-symbol"><NovaMark size={40} /></div><h1>A space of your own.</h1><p>{config.passwordConfigured ? "Enter your workspace password to continue." : "Set APP_PASSWORD on the server to unlock your production workspace."}</p>{config.passwordConfigured && <form onSubmit={signIn}><label htmlFor="password">Workspace password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><button className="primary-button" disabled={signingIn}>{signingIn ? "Signing in…" : "Enter workspace"}<ArrowUpRight size={17} /></button></form>}{error && <p role="alert" className="error-text">{error}</p>}</div> : <>
      <div ref={scrollArea} className="conversation-scroll" onScroll={e => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 100); }}>
        {!messages.length ? <div className="welcome"><div className="welcome-kicker"><span /> A LITTLE CLARITY. A LOT OF POSSIBILITY.</div><div className="welcome-symbol"><NovaMark size={43} /></div><h1>Where shall we<br/><span>take your mind today?</span></h1><p className="welcome-description">Big ideas, small questions, and everything in between.<br className="desktop-break"/> Think it through with Nova.</p><div className="suggestions">{suggestions.map(({ icon: Icon, ...item }) => <button key={item.title} className="suggestion-card" onClick={() => { setDraft(item.prompt); textarea.current?.focus(); }}><div className="suggestion-top"><span className={`suggestion-icon ${item.color}`}><Icon size={18} /></span><ArrowUpRight size={15} /></div><strong>{item.title}</strong><span className="suggestion-description">{item.description}</span></button>)}</div><div className="welcome-footnote"><Sparkles size={13} /><span>A thoughtful partner for whatever comes next.</span></div></div> : <div className="messages-container">
          <div className="conversation-heading">{renaming ? <form onSubmit={e => { e.preventDefault(); if (activeChat && renameTitle.trim()) dispatch({ type: "save", chat: { ...activeChat, title: renameTitle.trim().slice(0, 160) } }); setRenaming(false); }}><input autoFocus aria-label="Conversation title" value={renameTitle} maxLength={160} onChange={e => setRenameTitle(e.target.value)} /><button className="icon-button" aria-label="Save title"><Check size={17} /></button></form> : <button className="conversation-name" title="Rename conversation" disabled={streaming} onClick={() => { setRenameTitle(activeChat?.title || ""); setRenaming(true); }}>{activeChat?.title}<PenLine size={13} /></button>}<button className="icon-button" title="Export as Markdown" aria-label="Export conversation" onClick={exportChat}><Download size={16} /></button></div>
          {messages.map((message, index) => message.role === "user" ? <div className="user-message" key={message.id}><div>{message.content}</div></div> : <article className="assistant-message" key={message.id}><span className="assistant-avatar"><NovaMark size={19} /></span><div className="assistant-content"><div className="assistant-label">Nova<span>Your thinking partner</span></div>{message.content ? <Markdown content={message.content} /> : streaming && index === messages.length - 1 ? <div className="thinking" role="status"><span /><span /><span /><span className="sr-only">Nova is thinking</span></div> : <p className="response-note">{message.status === "error" ? "Couldn't complete this response." : "Response stopped."}</p>}{message.content && !streaming && <div className="message-actions"><CopyButton text={message.content} label="Copy response" />{message.status !== "complete" && <span className="response-note">{message.status === "stopped" ? "Stopped" : "Incomplete"}</span>}</div>}</div></article>)}
          {!streaming && lastAssistant?.role === "assistant" && lastUser && <button className="retry-button" onClick={() => void send(lastUser.content, true)}><RefreshCw size={14} />{lastAssistant.status === "complete" ? "Regenerate response" : "Retry response"}</button>}
        </div>}
      </div>
      <div className="composer-region">
        {!atBottom && messages.length > 0 && <button className="scroll-bottom icon-button" aria-label="Scroll to latest message" onClick={() => { setAtBottom(true); scrollArea.current?.scrollTo({ top: scrollArea.current.scrollHeight, behavior: "smooth" }); }}><ArrowDown size={18} /></button>}
        {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={15} /></button></div>}
        {storageError && <div className="setup-notice" role="status">Browser storage is unavailable or full. Export important chats before leaving.</div>}
        {config && !config.ready && <div className="setup-notice"><span>One step to your first reply.</span> Add your OpenAI API key in <code>.env.local</code> and restart the server.</div>}
        <form className={`composer ${streaming ? "is-streaming" : ""}`} onSubmit={e => { e.preventDefault(); void send(draft); }}><textarea ref={textarea} aria-label="Message Nova" placeholder="Ask anything, or just start a thought…" value={draft} maxLength={MAX_MESSAGE_LENGTH} disabled={!state.loaded} rows={2} onChange={e => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px"; }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!streaming) void send(draft); } }} /><div className="composer-bottom"><button className="model-label" type="button" onClick={() => setSettings(true)} title="View model and workspace details"><NovaMark size={15} /><span>Nova AI</span><ChevronDown size={13} /></button><div className="composer-controls">{draft.length > 7_000 ? <span className="character-count">{draft.length}/8,000</span> : <span className="enter-hint">Shift + Enter for a new line</span>}{streaming ? <button type="button" className="send-button stop-button" aria-label="Stop generating" title="Stop generating" onClick={() => abortController.current?.abort()}><Square size={15} fill="currentColor" /></button> : <button type="submit" className="send-button" aria-label="Send message" title="Send message" disabled={!draft.trim() || !state.loaded || !config || !config.ready}><ArrowUp size={20} /></button>}</div></div></form>
        <div className="composer-footnote"><span>Nova can make mistakes. Give important details a second look.</span><span className="powered-note">MADE FOR YOUR MIND <NovaMark size={11} /></span></div>
      </div></>}
    </div>
    {settings && <div className="modal-backdrop" onClick={() => setSettings(false)}><dialog open className="settings-dialog" aria-labelledby="settings-title" onClick={e => e.stopPropagation()}><div className="dialog-heading"><h2 id="settings-title">Your workspace</h2><button autoFocus className="icon-button" aria-label="Close settings" onClick={() => setSettings(false)}><X size={19} /></button></div><p>A quieter place to think, create, and explore.</p><div className="settings-row"><span>Appearance</span><button onClick={toggleTheme}>{dark ? <Moon size={16} /> : <Sun size={16} />}{dark ? "Dark" : "Light"}</button></div><div className="settings-row"><span>AI model</span><code>{config?.model || "Connecting…"}</code></div><div className="settings-row"><span>Connection</span><span className={config?.ready ? "connection-ready" : "connection-pending"}>{config?.ready ? "API key configured" : "API key needed"}</span></div><div className="privacy-box"><ShieldCheck size={19} /><div><strong>Your conversations, your browser.</strong><p>Chat history is stored locally on this device. Messages are sent to OpenAI to generate replies. API response storage is disabled; OpenAI&apos;s own data policies still apply. Clearing browser data removes your history.</p></div></div><button className="settings-action" onClick={() => { setSettings(false); if (activeChat) exportChat(); }} disabled={!activeChat}><Download size={16} />Export current conversation</button>{config?.passwordConfigured && <button className="settings-action" onClick={async () => { abortController.current?.abort(); const res = await fetch("/api/session", { method: "DELETE" }); if (res.ok) { setSettings(false); await loadConfig(); } else setError("Could not sign out. Please retry."); }}><LogOut size={16} />Sign out</button>}</dialog></div>}
    {deleteId && <div className="modal-backdrop" onClick={() => setDeleteId(null)}><dialog open className="settings-dialog delete-dialog" aria-labelledby="delete-title" onClick={e => e.stopPropagation()}><h2 id="delete-title">Delete this conversation?</h2><p>This removes it from this browser permanently.</p><div className="dialog-buttons"><button autoFocus className="secondary-button" onClick={() => setDeleteId(null)}>Keep conversation</button><button className="danger-button" onClick={() => { dispatch({ type: "delete", id: deleteId }); setDeleteId(null); setError(null); }}>Delete</button></div></dialog></div>}
    {!config && <div className="connection-status" role="status"><LoaderCircle size={14} className="spin" />Connecting to your workspace{error && <button onClick={() => void loadConfig()}>Retry</button>}</div>}
  </div>;
}
