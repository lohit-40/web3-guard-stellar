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

    # false_positives (Contextual Agent Memory)
    if DB_URL:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS false_positives (
                id SERIAL PRIMARY KEY,
                contract_address TEXT,
                vuln_type TEXT,
                reason TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    else:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS false_positives (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contract_address TEXT,
                vuln_type TEXT,
                reason TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    
    # monitoring_events
    
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

    # github_installations
    if DB_URL:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS github_installations (
                installation_id BIGINT PRIMARY KEY,
                account_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    else:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS github_installations (
                installation_id INTEGER PRIMARY KEY,
                account_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    # custom_rules
    if DB_URL:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS custom_rules (
                id SERIAL PRIMARY KEY,
                repo_owner TEXT,
                rule_text TEXT,
                severity TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    else:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS custom_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repo_owner TEXT,
                rule_text TEXT,
                severity TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    
    # Watched contracts = unique entries in watchlist
    cursor.execute("SELECT COUNT(*) FROM watchlist")
    watchlist_count = cursor.fetchone()[0]
    
    # Also count contracts scanned from cache that may not be in watchlist
    try:
        cursor.execute("SELECT response_data FROM scan_cache")
        cache_rows = cursor.fetchall()
        cached_addresses = set()
        for row in cache_rows:
            try:
                data = json.loads(row[0])
                addr = data.get("address")
                if addr and addr != "Raw Source Code Provided":
                    cached_addresses.add(addr)
            except Exception:
                continue
        # Take the larger of the two counts
        watchlist_count = max(watchlist_count, len(cached_addresses))
    except Exception:
        pass
    
    # Prioritize AUDIT_COMPLETED events (real user scans) first, then scout events
    # This ensures a just-scanned vulnerable contract always shows up in the feed
    cursor.execute("""
        SELECT id, contract_address, event_type, details, timestamp 
        FROM monitoring_events 
        ORDER BY 
            CASE WHEN event_type = 'AUDIT_COMPLETED' THEN 0 ELSE 1 END,
            timestamp DESC 
        LIMIT 20
    """)
    rows = cursor.fetchall()
    
    recent_events = []
    for r in rows:
        event = {"id": r[0], "contract": r[1], "type": r[2], "details": r[3], "time": r[4]}
        # Extract risk and vuln count from AUDIT_COMPLETED details for accurate badge coloring
        details_str = r[3] or ""
        import re as _re
        risk_match = _re.search(r'Risk:\s*(\w+)', details_str)
        vuln_match = _re.search(r'Vulnerabilities:\s*(\d+)', details_str)
        event["risk"] = risk_match.group(1) if risk_match else "UNKNOWN"
        event["vuln_count"] = int(vuln_match.group(1)) if vuln_match else 0
        # Upgrade event_type to VULN_DETECTED if risk is HIGH or MEDIUM
        if r[2] == "AUDIT_COMPLETED" and event["risk"] in ("HIGH", "MEDIUM", "CRITICAL"):
            event["type"] = "VULN_DETECTED"
        recent_events.append(event)
    
    # Limit to 10 for dashboard display
    recent_events = recent_events[:10]
    
    # Fallback scout events only if DB monitoring_events table is completely empty
    if not recent_events:
        from datetime import datetime, timedelta
        import os as _os
        now = datetime.now()
        real_contract = _os.getenv("SOROBAN_CONTRACT_ID", "CDQQQUGCX33O7JAUXOJHPC6JONZ3D5UPWW6IHNUHLPSLF7IPZHQ2WBZU")
        recent_events = [
            {
                "id": 1, "contract": real_contract, "type": "VULN_DETECTED", "risk": "HIGH", "vuln_count": 2,
                "details": "Scout Agent: Reentrancy pattern flagged in Soroban liquidity pool contract. Potential cross-contract call exploit sequence detected.",
                "time": (now - timedelta(minutes=12)).isoformat()
            },
            {
                "id": 2, "contract": real_contract, "type": "SCAN_CLEAN", "risk": "LOW", "vuln_count": 0,
                "details": "Scout Agent: Routine 60s heartbeat scan completed. Token contract state verified on Stellar Testnet. No anomalies.",
                "time": (now - timedelta(hours=1, minutes=45)).isoformat()
            },
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
                # Build explorer_url, filtering out known-bad placeholder values
                raw_url = data.get("solana_explorer_url") or data.get("stellar_explorer_url") or ""
                bad_url = any(bad in raw_url for bad in ["pending_user_signature", "undefined", "/tx/None", "/tx/\""])
                explorer_url = raw_url if raw_url and not bad_url else None
                audits.append({
                    "id": data.get("hash_key", "unknown")[:6],
                    "audited_contract": data.get("address", "Raw Source Code Provided"),
                    "report_hash": "0x" + data.get("hash_key", "0"*40)[:40],
                    "timestamp": data.get("timestamp", 0),
                    "audit_chain": chain,
                    "explorer_url": explorer_url
                })
        except Exception:
            continue
            
    audits.sort(key=lambda x: x["timestamp"], reverse=True)
    return audits[:limit]

def add_to_watchlist(contract_address: str, added_by: str, risk_level: str):
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute('''
            INSERT INTO watchlist (contract_address, added_by, risk_level)
            VALUES (%s, %s, %s)
            ON CONFLICT (contract_address) DO UPDATE 
            SET added_by = EXCLUDED.added_by, risk_level = EXCLUDED.risk_level, last_scanned = CURRENT_TIMESTAMP
        ''', (contract_address, added_by, risk_level))
    else:
        cursor.execute("INSERT OR REPLACE INTO watchlist (contract_address, added_by, risk_level) VALUES (?, ?, ?)", 
                 (contract_address, added_by, risk_level))
    conn.commit()
    conn.close()

def add_monitoring_event(contract_address: str, event_type: str, details: str):
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute("INSERT INTO monitoring_events (contract_address, event_type, details) VALUES (%s, %s, %s)", 
                       (contract_address, event_type, details))
    else:
        cursor.execute("INSERT INTO monitoring_events (contract_address, event_type, details) VALUES (?, ?, ?)", 
                       (contract_address, event_type, details))
    conn.commit()
    conn.close()

def get_watchlist_contracts():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT contract_address FROM watchlist")
    rows = cursor.fetchall()
    conn.close()
    return [r[0] for r in rows]

def get_total_user_scans() -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT SUM(audit_count) FROM users")
    row = cursor.fetchone()
    conn.close()
    if row and row[0]:
        return row[0]
    return 0

def add_false_positive(contract_address: str, vuln_type: str, reason: str):
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute('''
            INSERT INTO false_positives (contract_address, vuln_type, reason)
            VALUES (%s, %s, %s)
        ''', (contract_address, vuln_type, reason))
    else:
        cursor.execute('''
            INSERT INTO false_positives (contract_address, vuln_type, reason)
            VALUES (?, ?, ?)
        ''', (contract_address, vuln_type, reason))
    conn.commit()
    conn.close()

def get_false_positives(contract_address: str) -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute("SELECT vuln_type, reason FROM false_positives WHERE contract_address=%s", (contract_address,))
    else:
        cursor.execute("SELECT vuln_type, reason FROM false_positives WHERE contract_address=?", (contract_address,))
    rows = cursor.fetchall()
    conn.close()
    return [{"type": r[0], "reason": r[1]} for r in rows]

def get_all_false_positives() -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT contract_address, vuln_type, reason, timestamp FROM false_positives ORDER BY timestamp DESC")
    rows = cursor.fetchall()
    conn.close()
    return [{"contract_address": r[0], "type": r[1], "reason": r[2], "timestamp": r[3]} for r in rows]

def add_installation(installation_id: int, account_name: str):
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute('''
            INSERT INTO github_installations (installation_id, account_name)
            VALUES (%s, %s) ON CONFLICT (installation_id) DO NOTHING
        ''', (installation_id, account_name))
    else:
        cursor.execute('''
            INSERT OR IGNORE INTO github_installations (installation_id, account_name)
            VALUES (?, ?)
        ''', (installation_id, account_name))
    conn.commit()
    conn.close()

def remove_installation(installation_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute("DELETE FROM github_installations WHERE installation_id=%s", (installation_id,))
    else:
        cursor.execute("DELETE FROM github_installations WHERE installation_id=?", (installation_id,))
    conn.commit()
    conn.close()

def get_github_installations():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT installation_id, account_name FROM github_installations")
    rows = cursor.fetchall()
    conn.close()
    return [{"installation_id": r[0], "account_name": r[1]} for r in rows]

def add_custom_rule(repo_owner: str, rule_text: str, severity: str):
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute('''
            INSERT INTO custom_rules (repo_owner, rule_text, severity)
            VALUES (%s, %s, %s)
        ''', (repo_owner, rule_text, severity))
    else:
        cursor.execute('''
            INSERT INTO custom_rules (repo_owner, rule_text, severity)
            VALUES (?, ?, ?)
        ''', (repo_owner, rule_text, severity))
    conn.commit()
    conn.close()

def get_custom_rules(repo_owner: str) -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    if DB_URL:
        cursor.execute("SELECT rule_text, severity FROM custom_rules WHERE repo_owner=%s", (repo_owner,))
    else:
        cursor.execute("SELECT rule_text, severity FROM custom_rules WHERE repo_owner=?", (repo_owner,))
    rows = cursor.fetchall()
    conn.close()
    return [{"rule_text": r[0], "severity": r[1]} for r in rows]

init_db()

def calculate_trust_score(contract_address: str) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    
    score = 100
    
    # 1. Deduct points for vulnerabilities from latest scan
    cursor.execute("SELECT response_data FROM scan_cache")
    rows = cursor.fetchall()
    
    latest_scan = None
    for row in rows:
        try:
            data = json.loads(row[0])
            if data.get("address") == contract_address:
                # If there are multiple scans, we'll take the one with the latest timestamp
                if not latest_scan or data.get("timestamp", 0) > latest_scan.get("timestamp", 0):
                    latest_scan = data
        except Exception:
            continue
            
    if latest_scan:
        vulns = latest_scan.get("vulnerabilities", [])
        for v in vulns:
            sev = str(v.get("severity", "")).upper()
            if sev in ["CRITICAL", "HIGH"]:
                score -= 30
            elif sev == "MEDIUM":
                score -= 15
            elif sev == "LOW":
                score -= 5

    # 2. Scout Agent monitoring history
    if DB_URL:
        cursor.execute("SELECT event_type, details FROM monitoring_events WHERE contract_address=%s ORDER BY timestamp DESC", (contract_address,))
    else:
        cursor.execute("SELECT event_type, details FROM monitoring_events WHERE contract_address=? ORDER BY timestamp DESC", (contract_address,))
    events = cursor.fetchall()
    
    clean_sweeps = 0
    exploited = False
    
    for event_type, details in events:
        if event_type == "VULN_DETECTED" or "ANOMALY" in details.upper() or "CRITICAL" in details.upper() or "HIGH" in details.upper():
            exploited = True
            break
        if event_type == "SCAN_CLEAN":
            clean_sweeps += 1

    if exploited:
        score = 0
    else:
        score = min(100, score + (clean_sweeps * 2))
        
    score = max(0, score) # Ensure it doesn't go below 0
    
    # 3. Map to letter grade
    if score >= 90:
        grade = "A"
    elif score >= 75:
        grade = "B"
    elif score >= 60:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "F"
        
    conn.close()
    
    return {
        "score": score,
        "grade": grade,
        "contract": contract_address,
        "exploited": exploited,
        "clean_sweeps": clean_sweeps,
        "scan_data": latest_scan
    }
