'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, RotateCcw, Bot, Wrench, Check, Ban } from 'lucide-react';

// Agent Gateway가 HITL(사람 승인) 단계에서 보내는 마커.
// AIR Studio 지원팀 확인 결과: "승인"/"거부" 같은 자연어로는 재개되지 않고,
// 마커에 박혀있는 AIRQUERY 코드(난수)를 그대로 query로 돌려보내야 승인 처리된다.
const AIRAPP_TAG_PATTERN = '\\[AIRAPP:(AIRAPPROVAL|AIRREJECT)\\]\\(AIRQUERY:[^)]+\\)';
const AIRAPPROVAL_RE = /\[AIRAPP:AIRAPPROVAL\]\(AIRQUERY:([^)]+)\)/;
const AIRREJECT_RE = /\[AIRAPP:AIRREJECT\]\(AIRQUERY:([^)]+)\)/;

// crypto.randomUUID()는 HTTPS(또는 localhost) 등 보안 컨텍스트에서만 지원되므로,
// 평문 HTTP로 서비스되는 환경(예: SSL 미적용 EC2)에서도 죽지 않도록 폴백을 둔다.
function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// 자연어 DB 운영 Agent 채팅 드로어
// - 화면 우하단 플로팅 버튼으로 어느 탭에서든 열 수 있음
// - /api/agent/chat 을 통해 SSE 스트리밍 응답을 받아 토큰 단위로 렌더링
// - Agent 게이트웨이가 조회(oracle-readonly)/작업(oracle-write) MCP를 내부적으로 라우팅함
// - RDS 클래스 변경처럼 위험도가 높은 작업은 flow 안에 HITL(사람 승인) 단계가 걸려 있고,
//   AIRAPP 마커가 오면 승인/거부 버튼으로 렌더링해 사용자가 직접 결정하게 한다 (ChatBubble 참고)
// - 그 외 tool/action 이벤트는 최소한의 투명성 확보를 위해 시스템 메모로 구분해 보여준다.
export default function AgentChat() {
    const [open, setOpen] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant' | 'system', text }
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const scrollRef = useRef(null);
    // sessionId를 state로만 들고 있으면 스트리밍 중(같은 tick 안에서) 최신값을 못 읽는 stale-closure
    // 문제가 생길 수 있어서, 실제 요청에는 항상 ref를 참조한다. state는 화면 표시/리렌더 트리거용.
    const sessionIdRef = useRef(null);

    const setSession = (id) => {
        sessionIdRef.current = id;
        setSessionId(id);
    };

    useEffect(() => {
        if (!sessionIdRef.current) setSession(generateId());
    }, []);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, sending]);

    const resetChat = () => {
        setSession(generateId());
        setMessages([]);
    };

    // SSE 청크 하나를 파싱해서 messages 상태에 반영
    const appendChunk = (payload) => {
        let text = null;
        let note = null;

        try {
            const json = JSON.parse(payload);
            // 게이트웨이가 우리가 보낸 것과 다른 session_id를 내려주면(세션을 자체적으로 새로 발급하는
            // 경우), 이후 요청부터는 그 값을 따라가야 HITL 재개 등 대화 컨텍스트가 끊기지 않는다.
            if (json.session_id && json.session_id !== sessionIdRef.current) {
                setSession(json.session_id);
            }
            text = json.delta ?? json.chunk ?? json.content ?? json.text ?? json.answer ?? json.token ?? null;
            if (text === null && json.type) {
                note = `⚙️ ${json.type}${json.tool ? ` · ${json.tool}` : ''}`;
            }
        } catch {
            // JSON이 아니면 순수 텍스트 델타로 취급
            text = payload;
        }

        setMessages(prev => {
            const next = [...prev];
            if (note) {
                next.push({ role: 'system', text: note });
                next.push({ role: 'assistant', text: '' }); // 이후 텍스트가 이어붙을 새 버블
                return next;
            }
            if (text) {
                const lastIdx = next.length - 1;
                next[lastIdx] = { ...next[lastIdx], text: (next[lastIdx]?.text || '') + text };
            }
            return next;
        });
    };

    // displayText: 채팅창에 보여줄 텍스트 (없으면 query 그대로 표시).
    // HITL 승인/거부는 실제로 보내는 query(AIRQUERY 코드)와 사람이 읽을 텍스트("승인")가 다르다.
    const sendMessage = async (query, displayText) => {
        if (!query || sending) return;

        setMessages(prev => [...prev, { role: 'user', text: displayText ?? query }, { role: 'assistant', text: '' }]);
        setSending(true);

        // 서버(/api/agent/chat)에도 180초 타임아웃이 있지만, 그쪽이 응답 자체를 못 주는
        // 극단적인 경우까지 대비한 클라이언트 쪽 이중 안전장치 (190초 후 강제 abort).
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 190_000);

        try {
            const res = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, session_id: sessionIdRef.current }),
                signal: controller.signal,
            });

            if (!res.ok || !res.body) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `요청 실패 (${res.status})`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const events = buffer.split('\n\n');
                buffer = events.pop() ?? '';

                for (const evt of events) {
                    const dataLines = evt
                        .split('\n')
                        .filter(l => l.startsWith('data:'))
                        .map(l => l.slice(5).trim());
                    if (dataLines.length === 0) continue;
                    const payload = dataLines.join('\n');
                    if (!payload || payload === '[DONE]') continue;
                    appendChunk(payload);
                }
            }
        } catch (e) {
            const msg = e.name === 'AbortError' ? '응답이 너무 오래 걸려 요청을 중단했습니다. (타임아웃)' : e.message;
            setMessages(prev => [...prev, { role: 'system', text: `⚠️ ${msg}` }]);
        } finally {
            clearTimeout(timeoutId);
            setSending(false);
        }
    };

    const handleSend = () => {
        const query = input.trim();
        if (!query) return;
        setInput('');
        sendMessage(query);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // HITL 승인/거부 버튼 클릭 -> 마커에 들어있던 AIRQUERY 코드를 그대로 query로 전송해 flow를 재개.
    // ("승인"/"거부" 같은 자연어는 재개 신호로 인식되지 않는다 — AIR Studio 지원팀 확인)
    const handleDecision = (msgIndex, decision, queryId) => {
        setMessages(prev => prev.map((m, i) => (i === msgIndex ? { ...m, decided: true } : m)));
        if (!queryId) {
            setMessages(prev => [...prev, { role: 'system', text: '⚠️ 승인 코드(AIRQUERY)를 찾지 못해 전송할 수 없습니다.' }]);
            return;
        }
        sendMessage(queryId, decision === 'approve' ? '승인' : '거부');
    };

    return (
        <>
            {/* Floating toggle button */}
            <button
                onClick={() => setOpen(o => !o)}
                className="fixed bottom-6 right-6 z-40 p-4 rounded-full bg-orange-600 text-white shadow-xl hover:bg-orange-500 transition-colors"
            >
                {open ? <X className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
            </button>

            {/* Chat drawer */}
            {open && (
                <div className="fixed bottom-24 right-6 z-40 w-[500px] h-[560px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                    <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-zinc-50 dark:bg-zinc-950 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-orange-600 rounded-lg">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-tight">DB Ops Agent</h3>
                                <p className="text-[10px] text-zinc-500">
                                    자연어로 DB 조회/작업 요청
                                    {sessionId && <span className="ml-1.5 font-mono opacity-60">· {sessionId.slice(0, 8)}</span>}
                                </p>
                            </div>
                        </div>
                        <button onClick={resetChat} title={`New Chat (session: ${sessionId || ''})`} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                            <RotateCcw className="w-3.5 h-3.5 text-zinc-500" />
                        </button>
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 && (
                            <div className="text-center text-xs text-zinc-400 dark:text-zinc-600 py-10 space-y-1">
                                <p>예: "지금 제일 오래 걸리는 세션 알려줘"</p>
                                <p>예: "101번 세션 죽여줘"</p>
                            </div>
                        )}
                        {messages.map((m, i) => (
                            <ChatBubble key={i} role={m.role} text={m.text} decided={m.decided} onDecision={(decision, queryId) => handleDecision(i, decision, queryId)} />
                        ))}
                        {sending && (
                            <div className="flex items-center gap-2 text-xs text-zinc-400">
                                <Loader2 className="w-3 h-3 animate-spin" /> 응답 중...
                            </div>
                        )}
                    </div>

                    <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2 shrink-0">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="DB에게 물어보거나 작업을 요청하세요..."
                            rows={1}
                            className="flex-1 resize-none bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:border-orange-500 outline-none transition-colors"
                        />
                        <button
                            onClick={handleSend}
                            disabled={sending || !input.trim()}
                            className="p-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500 disabled:opacity-40 transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

const ChatBubble = ({ role, text, decided, onDecision }) => {
    if (role === 'system') {
        return (
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-600 italic">
                <Wrench className="w-3 h-3" /> {text}
            </div>
        );
    }
    const isUser = role === 'user';

    const rawText = text || '';
    const approveMatch = !isUser ? rawText.match(AIRAPPROVAL_RE) : null;
    const rejectMatch = !isUser ? rawText.match(AIRREJECT_RE) : null;
    const needsApproval = Boolean(approveMatch || rejectMatch);
    const cleanText = needsApproval ? rawText.replace(new RegExp(AIRAPP_TAG_PATTERN, 'g'), '').trim() : rawText;

    return (
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-2`}>
            <div
                className={`max-w-[85%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap break-words ${
                    isUser ? 'bg-orange-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                }`}
            >
                {cleanText || (!isUser ? '…' : '')}
            </div>

            {needsApproval && (
                <div className="flex items-center gap-2">
                    {decided ? (
                        <span className="text-[10px] text-zinc-400 italic">처리됨</span>
                    ) : (
                        <>
                            <button
                                onClick={() => onDecision('approve', approveMatch?.[1])}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                            >
                                <Check className="w-3 h-3" /> 승인
                            </button>
                            <button
                                onClick={() => onDecision('reject', rejectMatch?.[1])}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                            >
                                <Ban className="w-3 h-3" /> 거부
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
