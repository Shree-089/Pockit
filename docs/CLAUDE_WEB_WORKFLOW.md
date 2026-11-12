# Working with Claude Web

Claude Web cannot directly edit your local VS Code filesystem in this workflow.

For each phase:
1. Give Claude the relevant phase prompt from `CLAUDE_PROMPTS.md`.
2. Ask it to list files it intends to create/change before generating code.
3. Ask for one small batch at a time.
4. For each file, require the exact relative path and complete file contents.
5. Create/update the file in VS Code.
6. Run the exact test commands.
7. Paste terminal output/errors back to Claude (and ChatGPT if you want a second review).
8. Inspect the diff and commit working changes with Git.

Do not paste secrets into chat. Put local credentials in `.env` files and keep them out of Git.

Suggested commit checkpoints:
- chore: initialize project scaffold
- feat: add mobile app shell
- feat: add wallet screens
- feat: add wallet and budget APIs
- feat: add Nebius budget allocation
- feat: add spending guard
- feat: integrate PayPal sandbox
- chore: prepare hackathon submission
