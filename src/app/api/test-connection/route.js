import oracledb from 'oracledb';
import { NextResponse } from 'next/server';

export async function POST(req) {
    let connection;
    try {
        const config = await req.json();

        // Construct connection string for testing
        const connectString = `${config.host}:${config.port}/${config.sid}`;

        connection = await oracledb.getConnection({
            user: config.user,
            password: config.password,
            connectString: connectString
        });

        // Optional: Run a simple query to verify
        await connection.execute('SELECT 1 FROM DUAL');

        return NextResponse.json({ success: true, message: 'Connection Successful!' });
    } catch (err) {
        console.error('Test Connection Failed:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error('Error closing test connection:', e);
            }
        }
    }
}
