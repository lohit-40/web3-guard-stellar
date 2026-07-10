import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  return NextResponse.json({
    tx_hash: "0000000000000000000000000000000000000000000000000000000000000000"
  });
}
