# Security and data boundaries

owngame runs locally with the permissions of its host agent. It does not provide
an isolation boundary, hold API credentials or run a separate background agent.
Only install and execute templates from sources you trust.

Setup writes inside the selected project, previews changes before --apply,
refuses managed symlink paths and conflicting edited files, and backs up replaced
configuration. Backups can contain unrelated host settings; keep .owngame private.
Do not commit local MCP configuration, credential files or raw device captures.

Report vulnerabilities through the repository's private vulnerability reporting
feature when enabled. If it is unavailable, open an issue asking for a private
contact without including an exploit, credentials or personal data. Do not paste
secrets into public issue templates. No response-time guarantee is offered.
