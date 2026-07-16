## Session: 2026-07-16 13:53

### Objective
Fix broken backend/CLI connection, harden Soroban AI detection, fix Railway deployment, and finalize NPM publishing pipeline.

### Accomplished
- [x] CLI API_URL pointed to Railway backend.
- [x] Hardened AI prompts for Soroban smart contracts in main.py and ci_router.py.
- [x] Replaced failing 
ixpacks.toml with a root Dockerfile to fix Railway deployment.
- [x] Uncommented NPM publish command in GitHub Actions.
- [x] Added UI buttons to download CLI on the frontend.

### Paused Because
User is starting a new chat for a completely new project. Saving context for future handoff.

### Handoff Notes
Repository is stable, CI is functional, and the deployment architecture has been solidified. Wait for user to add NPM_TOKEN for the next run.

