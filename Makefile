.PHONY: deploy build-web deploy-api deploy-web help

SSH_HOST ?= 213.165.58.70
SSH_USER ?= root
SSH_CMD = python scripts/ssh-run.py

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-14s %s\n", $$1, $$2}'

deploy: ## Full deploy: git pull, build frontend, rebuild API container
	@echo "=== Deploying md.succ.ai ==="
	$(SSH_CMD) "su - md_succ_ai -c 'cd /home/md_succ_ai/repo && git pull'"
	@echo "--- Building frontend ---"
	$(SSH_CMD) "cd /home/md_succ_ai/repo/web && npm install --no-audit && npm run build"
	@echo "--- Rebuilding API container ---"
	$(SSH_CMD) "su - md_succ_ai -c 'cd /home/md_succ_ai/repo && docker compose up -d --build'"
	@echo "--- Health check ---"
	$(SSH_CMD) "sleep 3 && curl -sf http://localhost:3100/health"
	@echo ""
	@echo "=== Deploy complete ==="

deploy-web: ## Deploy frontend only (build Next.js on server)
	$(SSH_CMD) "su - md_succ_ai -c 'cd /home/md_succ_ai/repo && git pull'"
	$(SSH_CMD) "cd /home/md_succ_ai/repo/web && npm install --no-audit && npm run build"
	@echo "Frontend deployed"

deploy-api: ## Deploy API only (rebuild Docker container)
	$(SSH_CMD) "su - md_succ_ai -c 'cd /home/md_succ_ai/repo && git pull && docker compose up -d --build'"
	$(SSH_CMD) "sleep 3 && curl -sf http://localhost:3100/health"
	@echo "API deployed"

build-web: ## Build frontend locally
	cd web && npm run build
