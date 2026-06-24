import os

env_path = r"c:\Users\Asus\Desktop\bc-adv\stellar_submission_v2\backend\.env"
with open(env_path, "r") as f:
    lines = f.readlines()

new_lines = []
in_key = False
key_content = ""
for line in lines:
    if line.startswith("GITHUB_APP_PRIVATE_KEY="):
        in_key = True
        key_content += line.split("=", 1)[1].strip() + "\\n"
    elif in_key:
        if line.startswith("-----END RSA PRIVATE KEY-----"):
            key_content += line.strip() + "\\n"
            new_lines.append(f'GITHUB_APP_PRIVATE_KEY="{key_content}"\n')
            in_key = False
        else:
            if line.strip():
                key_content += line.strip() + "\\n"
    else:
        new_lines.append(line)

with open(env_path, "w") as f:
    f.writelines(new_lines)

print("Fixed .env file formatting!")
