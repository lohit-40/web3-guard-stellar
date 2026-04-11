import sqlite3
import json
import os
from dotenv import load_dotenv

load_dotenv(override=True)
DB_URL = os.getenv("DATABASE_URL")
DB_PATH = "cache.db"

def get_connection():
    if DB_URL:
        import psycopg2
        return psycopg2.connect(DB_URL)
    return sqlite3.connect(DB_PATH)

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # scan_cache
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scan_cache (
            hash_key TEXT PRIMARY KEY,
            response_data TEXT
        )
    ''')
    
    # users
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            wallet_address TEXT PRIMARY KEY,
            first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            audit_count INTEGER DEFAULT 0
        )
    ''')
    
    # watchlist
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS watchlist (
            contract_address TEXT PRIMARY KEY,
            added_by TEXT,
            last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            risk_level TEXT
        )
    ''')
    
    # monitoring_events
    if DB_URL:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS monitoring_events (
                id SERIAL PRIMARY KEY,
                contract_address TEXT,
                event_type TEXT,
                details TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    else:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS monitoring_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contract_address TEXT,
                event_type TEXT,
                details TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    conn.commit()
    conn.close()

def record_user_activity(wallet_address: str):
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute('''
            INSERT INTO users (wallet_address, audit_count) 
            VALUES (%s, 1) 
            ON CONFLICT (wallet_address) DO UPDATE 
            SET audit_count = users.audit_count + 1
        ''', (wallet_address,))
    else:
        cursor.execute("INSERT OR IGNORE INTO users (wallet_address) VALUES (?)", (wallet_address,))
        cursor.execute("UPDATE users SET audit_count = audit_count + 1 WHERE wallet_address = ?", (wallet_address,))
    conn.commit()
    conn.close()

def get_dashboard_metrics():
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM watchlist")
    watchlist_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT id, contract_address, event_type, details, timestamp FROM monitoring_events ORDER BY timestamp DESC LIMIT 10")
    recent_events = [
        {"id": r[0], "contract": r[1], "type": r[2], "details": r[3], "time": r[4]} 
        for r in cursor.fetchall()
    ]
    
    conn.close()
    return {
        "active_users": user_count,
        "watched_contracts": watchlist_count,
        "recent_events": recent_events
    }

def get_cached_scan(hash_key: str):
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute("SELECT response_data FROM scan_cache WHERE hash_key=%s", (hash_key,))
    else:
        cursor.execute("SELECT response_data FROM scan_cache WHERE hash_key=?", (hash_key,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return json.loads(row[0])
    return None

def set_cached_scan(hash_key: str, response_data: dict):
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute('''
            INSERT INTO scan_cache (hash_key, response_data)
            VALUES (%s, %s)
            ON CONFLICT (hash_key) DO UPDATE 
            SET response_data = EXCLUDED.response_data
        ''', (hash_key, json.dumps(response_data)))
    else:
        cursor.execute('''
            INSERT OR REPLACE INTO scan_cache (hash_key, response_data)
            VALUES (?, ?)
        ''', (hash_key, json.dumps(response_data)))
    conn.commit()
    conn.close()

def get_recent_non_evm_audits(limit: int = 20):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT response_data FROM scan_cache")
    rows = cursor.fetchall()
    conn.close()
    
    audits = []
    for row in rows:
        try:
            data = json.loads(row[0])
            chain = data.get("audit_chain")
            if chain and chain != "ethereum":
                audits.append({
                    "id": data.get("hash_key", "unknown")[:6],
                    "audited_contract": data.get("address", "Raw Source Code Provided"),
                    "report_hash": "0x" + data.get("hash_key", "0"*40)[:40],
                    "timestamp": data.get("timestamp", 0),
                    "audit_chain": chain,
                    "explorer_url": data.get("solana_explorer_url") or data.get("stellar_explorer_url")
                })
        except Exception:
            continue
            
    audits.sort(key=lambda x: x["timestamp"], reverse=True)
    return audits[:limit]

init_db()
