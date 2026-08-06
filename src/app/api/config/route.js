import { getConfig, saveConfig } from '../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
    const config = getConfig();
    return NextResponse.json(config || { mockMode: true });
}

export async function POST(req) {
    try {
        const newConfig = await req.json();
        saveConfig(newConfig);
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
