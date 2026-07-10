import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // Mock successful Soroban proof submission
  return NextResponse.json({
    tx_hash: "b9d0b2292c4e09e8eb22d036171491e87b8d2086bf8b265874c8d182cb9c9020"
  });
}
