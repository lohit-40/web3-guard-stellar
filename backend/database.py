import sqlite3
import json

DB_PATH = "cache.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scan_cache (
            hash_key TEXT PRIMARY KEY,
            response_data TEXT
        )
    ''')
    conn.commit()
    conn.close()

def get_cached_scan(hash_key: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT response_data FROM scan_cache WHERE hash_key=?", (hash_key,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return json.loads(row[0])
    return None

def set_cached_scan(hash_key: str, response_data: dict):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO scan_cache (hash_key, response_data)
        VALUES (?, ?)
    ''', (hash_key, json.dumps(response_data)))
    conn.commit()
    conn.close()

def get_recent_non_evm_audits(limit: int = 20):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT response_data FROM scan_cache")
    rows = cursor.fetchall()
    conn.close()
    
    audits = []
    for row in rows:
        try:
            data = json.loads(row[0])
            # Only include audits that have an audit_chain other than None or ethereum
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
            
    # Sort by timestamp descending
    audits.sort(key=lambda x: x["timestamp"], reverse=True)
    return audits[:limit]

init_db()
