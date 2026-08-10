'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, RotateCcw, Bot, Wrench } from 'lucide-react';

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
// - Agent 게이트웨이가 조회(oracle-readonly)/작업(oracle-write) MCP를 내부적으로 라우팅하며,
//   현재 별도 승인 스텝 없이 DML/DDL/Kill까지 실행 가능하므로, 최소한의 투명성 확보를 위해
//   응답 스트림에 tool/action 관련 이벤트가 섞여 오면 시스템 메모로 구분해 보여준다.
export default function AgentChat() {
    const [open, setOpen] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant' | 'system', text }
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (!sessionId) setSessionId(generateId());
    }, [sessionId]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, sending]);

    const resetChat = () => {
        setSessionId(generateId());
        setMessages([]);
    };

    // SSE 청크 하나를 파싱해서 messages 상태에 반영
    const appendChunk = (payload) => {
        let text = null;
        let note = null;

        try {
            const json = JSON.parse(payload);
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

    const send = async () => {
        const query = input.trim();
        if (!query || sending) return;

        setMessages(prev => [...prev, { role: 'user', text: query }, { role: 'assistant', text: '' }]);
        setInput('');
        setSending(true);

        try {
            const res = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, session_id: sessionId }),
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
            setMessages(prev => [...prev, { role: 'system', text: `⚠️ ${e.message}` }]);
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
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
                <div className="fixed bottom-24 right-6 z-40 w-[380px] h-[560px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                    <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-zinc-50 dark:bg-zinc-950 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-orange-600 rounded-lg">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-tight">DB Ops Agent</h3>
                                <p className="text-[10px] text-zinc-500">자연어로 DB 조회/작업 요청</p>
                            </div>
                        </div>
                        <button onClick={resetChat} title="New Chat" className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors">
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
                            <ChatBubble key={i} role={m.role} text={m.text} />
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
                            onClick={send}
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

const ChatBubble = ({ role, text }) => {
    if (role === 'system') {
        return (
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-600 italic">
                <Wrench className="w-3 h-3" /> {text}
            </div>
        );
    }
    const isUser = role === 'user';
    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[85%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap break-words ${
                    isUser ? 'bg-orange-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                }`}
            >
                {text || (!isUser ? '…' : '')}
            </div>
        </div>
    );
};
