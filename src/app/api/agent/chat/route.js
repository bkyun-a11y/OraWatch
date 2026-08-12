import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 자연어 DB 운영 Agent Gateway 프록시
// - API Key는 서버(.env.local)에만 존재, 클라이언트에는 절대 노출하지 않음
// - 게이트웨이가 text/event-stream(SSE)으로 응답하므로 그대로 패스스루
export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
    }

    const { query, session_id } = body;
    if (!query) {
        return NextResponse.json({ error: 'query는 필수입니다.' }, { status: 400 });
    }

    const shortSession = (session_id || '').slice(0, 8);
    console.log(`[agent/chat] -> session=${shortSession} query="${query.slice(0, 80)}"`);

    const gatewayUrl = process.env.AGENT_GATEWAY_URL;
    const apiKey = process.env.AIR_STUDIO_API_KEY;
    // API Key 발급 대상 계정과 일치해야 하는 값 (게이트웨이가 키-사용자 매칭을 검사할 수 있음)
    const userId = process.env.AGENT_USER_ID;

    if (!gatewayUrl || !apiKey) {
        return NextResponse.json(
            { error: 'Agent Gateway가 설정되지 않았습니다. .env.local의 AGENT_GATEWAY_URL / AIR_STUDIO_API_KEY를 확인하세요.' },
            { status: 500 }
        );
    }

    // 업스트림(Agent Gateway/flow)이 응답을 아예 안 주고 무한 대기하는 경우를 막기 위한 타임아웃.
    // 헤더 수신 전 hang과, 스트리밍 중간에 멈추는 경우 둘 다 이 abort로 정리된다.
    const TIMEOUT_MS = 180_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let upstream;
    try {
        upstream = await fetch(gatewayUrl, {
            method: 'POST',
            headers: {
                'X-User-Id': userId || 'orawatch-user',
                'Authorization': apiKey,
                'Accept': 'text/event-stream',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session_id, query }),
            signal: controller.signal,
        });
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            console.error(`[agent/chat] <- session=${shortSession} TIMEOUT after ${TIMEOUT_MS / 1000}s (헤더조차 못 받음)`);
            return NextResponse.json(
                { error: `Agent Gateway 응답이 ${TIMEOUT_MS / 1000}초 내에 오지 않았습니다. (타임아웃)` },
                { status: 504 }
            );
        }
        console.error(`[agent/chat] <- session=${shortSession} 연결 실패: ${err.message}`);
        return NextResponse.json({ error: `Agent Gateway 연결 실패: ${err.message}` }, { status: 502 });
    }

    console.log(`[agent/chat] <- session=${shortSession} upstream status=${upstream.status}`);

    if (!upstream.ok || !upstream.body) {
        clearTimeout(timeoutId);
        const text = await upstream.text().catch(() => '');
        console.error(`[agent/chat] <- session=${shortSession} 오류 응답: ${text.slice(0, 300)}`);
        return NextResponse.json(
            { error: `Agent Gateway 오류 (${upstream.status}): ${text || upstream.statusText}` },
            { status: upstream.status || 502 }
        );
    }

    // 스트림이 도착하는 대로 로그도 같이 남기기 위해 tee — 클라이언트로 보내는 스트림은 그대로 두고,
    // 사본만 읽어서 pm2 로그에 무슨 내용이 오갔는지 남긴다 (디버깅용).
    const [clientStream, logStream] = upstream.body.tee();
    (async () => {
        try {
            const reader = logStream.getReader();
            const decoder = new TextDecoder();
            let collected = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                collected += decoder.decode(value, { stream: true });
            }
            clearTimeout(timeoutId);
            console.log(`[agent/chat] <- session=${shortSession} 스트림 종료, 총 ${collected.length}자 수신`);
            if (collected.length < 2000) console.log(`[agent/chat]    raw: ${collected}`);
        } catch (e) {
            console.error(`[agent/chat] <- session=${shortSession} 스트림 읽기 중 에러: ${e.message}`);
        }
    })();

    // SSE 스트림을 그대로 클라이언트에 패스스루
    return new Response(clientStream, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
}
