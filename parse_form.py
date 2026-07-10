import re
import json

with open(r'C:\Users\Asus\.gemini\antigravity-ide\brain\cd1d6180-4fba-46b8-8741-934bc49ef178\.system_generated\steps\213\content.md', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'window\.WIZ_global_data = (\{.*?\});', text)
if m:
    data = json.loads(m.group(1))
    tsdtv = data.get("TSDtV", "")
    
    # Extract strings from TSDtV that look like human-readable text
    # A simple regex for words with spaces
    matches = set(re.findall(r'\"([A-Z][A-Za-z0-9 ,.?\'-]{5,})\"', tsdtv))
    for match in matches:
        if "google.com" not in match and "gstatic" not in match:
            print("-", match)
else:
    print("No WIZ_global_data found")
