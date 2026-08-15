import { launchCursorPrompt } from "./prompt-transport.js";
import type { AgentRuntime, AgentRuntimeOptions, AgentSessionResult, CursorStreamSession } from "./types.js";

function context(options: AgentRuntimeOptions): string {
  const skills = Array.isArray(options.skills) ? options.skills.filter((value) => typeof value === "string" && value.trim()) : [];
  return ["Fusion runtime context:", `- Tool mode: ${options.tools ?? "readonly"}`, skills.length ? `- Requested skills: ${skills.join(", ")}` : ""].filter(Boolean).join("\n");
}

/*
FNXC:CursorCli 2026-08-15-15:16:
Cursor has no system-prompt flag, so Fusion fuses system context only into the first stdin prompt.
The stored cwd and tools are immutable session authority: later turns cannot turn a review session into --force.
*/
export class CursorRuntimeAdapter implements AgentRuntime {
  readonly id = "cursor";
  readonly name = "Cursor Runtime";
  constructor(private readonly settings?: Record<string, unknown>) {}
  async createSession(options: AgentRuntimeOptions): Promise<AgentSessionResult> {
    const messages: unknown[] = [];
    const session: CursorStreamSession = { model: options.defaultModelId?.replace(/^cursor-cli\//, "") ?? "auto", systemPrompt: options.systemPrompt, messages, state: { messages }, sessionId: "", cwd: options.cwd, tools: options.tools, callbacks: { onText: options.onText, onThinking: options.onThinking, onToolStart: options.onToolStart, onToolEnd: options.onToolEnd }, fusedSystemPrompt: [options.systemPrompt?.trim(), context(options)].filter(Boolean).join("\n\n"), disposed: false, dispose: () => {
      /* FNXC:CursorCli 2026-08-15-15:32: Disposing a Fusion session must abort its live autonomous Cursor turn so prompt-transport performs supervised process-tree teardown. */
      session.disposed = true;
      session.activeAbortController?.abort();
    } };
    return { session, sessionFile: undefined };
  }
  async promptWithFallback(session: CursorStreamSession, prompt: string, _options?: unknown): Promise<void> {
    if (session.disposed) throw new Error("Cursor session is disposed.");
    const priorId = session.sessionId;
    const first = !priorId;
    const sent = first ? `${session.fusedSystemPrompt}\n\nUser request:\n${prompt}` : prompt;
    const emitted = new Set<string>();
    const controller = new AbortController();
    session.activeAbortController = controller;
    try {
      const outcome = await launchCursorPrompt({ binary: typeof this.settings?.cursorCliBinaryPath === "string" ? this.settings.cursorCliBinaryPath : undefined, model: session.model, cwd: session.cwd, tools: session.tools, prompt: sent, resumeId: priorId || undefined, signal: controller.signal, onThinking: session.callbacks.onThinking, onToolStart: session.callbacks.onToolStart, onToolEnd: session.callbacks.onToolEnd, onText: (text) => { if (!emitted.has(text)) { emitted.add(text); session.callbacks.onText?.(text); } } });
      session.sessionId = outcome.sessionId ?? session.sessionId;
      session.messages.push({ role: "user", content: prompt }, { role: "assistant", content: outcome.text });
    } catch (error) { session.sessionId = priorId; throw error; } finally {
      if (session.activeAbortController === controller) session.activeAbortController = undefined;
    }
  }
  describeModel(session: CursorStreamSession): string { return `cursor-cli/${(session.model || "auto").replace(/^cursor-cli\//, "")}`; }
}
