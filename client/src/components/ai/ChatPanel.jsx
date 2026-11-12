import { useEffect, useRef, useState } from 'react'
import { Lightbulb, Send, Sparkles } from 'lucide-react'
import { useApp } from '../../hooks/useApp.js'
import { ASSISTANT_SUGGESTIONS } from '../../data/mockData.js'
import { cx } from '../../utils/ui.js'
import AiSourceBadge from './AiSourceBadge.jsx'

/** Pockit Copilot chat. Replies come from askAssistant(), which uses the live budget numbers. */
export default function ChatPanel() {
  const { askAssistant, getAssistantWelcome } = useApp()
  const [messages, setMessages] = useState(() => [getAssistantWelcome()])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, thinking])

  async function send(text) {
    const question = text.trim()
    if (!question || thinking) return
    // Recent turns give the model context for follow-up questions ("and next week?").
    const history = messages.filter((m) => m.id !== 'msg_welcome').slice(-6).map(({ role, text: t }) => ({ role, text: t }))
    setMessages((m) => [...m, { id: `user_${Date.now()}`, role: 'user', text: question }])
    setInput('')
    setThinking(true)
    try {
      const reply = await askAssistant(question, history)
      setMessages((m) => [...m, reply])
    } catch {
      setMessages((m) => [...m, { id: `err_${Date.now()}`, role: 'assistant', text: 'Sorry, I could not answer that right now.' }])
    } finally {
      setThinking(false)
    }
  }

  return (
    <section className="rounded-card bg-surface p-4 shadow-card">
      <header className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-indigo text-white">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="font-heading font-bold text-ink">Pockit Copilot</h2>
          <p className="text-xs text-muted">Answers use your real budget data</p>
        </div>
      </header>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {ASSISTANT_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            disabled={thinking}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-bg disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-96 space-y-3 overflow-y-auto" aria-live="polite">
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="ml-10 rounded-2xl rounded-br-md bg-indigo px-4 py-3 text-sm text-white">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="mr-6 rounded-2xl rounded-bl-md bg-violet-soft/70 px-4 py-3 text-sm text-ink">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-indigo">Pockit AI</p>
                {m.id !== 'msg_welcome' && <AiSourceBadge source={m.source} model={m.model} />}
              </div>
              <p>{m.text}</p>
              {m.tip && (
                <p className="mt-2 flex gap-2 rounded-xl bg-surface px-3 py-2 text-xs text-muted">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-royal" />
                  {m.tip}
                </p>
              )}
              {m.notice && <p className="mt-1.5 text-[11px] text-muted">{m.notice}</p>}
            </div>
          ),
        )}
        {thinking && (
          <div className="mr-6 inline-flex gap-1 rounded-2xl bg-violet-soft/70 px-4 py-3" aria-label="Pockit AI is typing">
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="size-1.5 animate-bounce rounded-full bg-indigo/60" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-3 flex items-center gap-2 rounded-full border border-line bg-bg py-1.5 pr-1.5 pl-4 focus-within:border-royal"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your budget…"
          aria-label="Ask Pockit AI"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || thinking}
          aria-label="Send"
          className={cx('grid size-9 place-items-center rounded-full bg-indigo text-white transition disabled:opacity-40')}
        >
          <Send className="size-4" />
        </button>
      </form>
    </section>
  )
}
