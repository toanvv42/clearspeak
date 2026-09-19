# ClearSpeak staging operations.
# Usage: make deploy  (full pipeline) or run targets individually.
# See RESTART_GUIDE.md for background.

SERVICE  := clearspeak-staging
UNIT_SRC := deploy/clearspeak-staging.service
UNIT_DST := /etc/systemd/system/clearspeak-staging.service
PORT     := 3444
APP_URL  := http://127.0.0.1:$(PORT)

# Access code for API verification, read from .env.local (gitignored secrets).
APP_ACCESS_CODE := $(shell grep -E '^APP_ACCESS_CODE=' .env.local 2>/dev/null | cut -d= -f2-)

.PHONY: help build install-unit check-unit restart serve verify doctor status logs deploy

help:
	@echo "Targets:"
	@echo "  deploy        build -> install-unit -> restart -> serve -> verify"
	@echo "  build         production build (webpack mode, pinned toolchain)"
	@echo "  install-unit  install systemd unit if changed + daemon-reload"
	@echo "  check-unit    fail if installed unit differs from $(UNIT_SRC)"
	@echo "  restart       restart $(SERVICE) and wait until active"
	@echo "  serve         ensure Tailscale Serve forwards :$(PORT) to $(APP_URL)"
	@echo "  verify        smoke-test local HTTP + history API"
	@echo "  doctor        config audit (catches missing env / unit drift)"
	@echo "  status        service status + tailscale serve rules"
	@echo "  logs          last 100 lines of service logs"

build:
	mise exec -- npx next build --webpack

install-unit:
	@if cmp -s $(UNIT_SRC) $(UNIT_DST); then \
		echo "unit in sync, skipping install"; \
	else \
		echo "installing $(UNIT_SRC) -> $(UNIT_DST)"; \
		sudo cp $(UNIT_SRC) $(UNIT_DST); \
		sudo systemctl daemon-reload; \
	fi

check-unit:
	@diff $(UNIT_SRC) $(UNIT_DST) >/dev/null \
		&& echo "unit in sync" \
		|| (echo "ERROR: installed unit differs from $(UNIT_SRC). Run 'make install-unit'."; exit 1)

restart: install-unit
	sudo systemctl restart $(SERVICE).service
	sudo systemctl is-active $(SERVICE).service
	@sleep 3
	sudo systemctl --no-pager status $(SERVICE).service | head -12

serve:
	@if sudo tailscale serve status 2>/dev/null | grep -q "proxy $(APP_URL)"; then \
		echo "tailscale serve already forwards to $(APP_URL)"; \
	else \
		sudo tailscale serve --bg --https=$(PORT) $(APP_URL); \
	fi
	sudo tailscale serve status

verify:
	@echo "== root responds =="
	curl -s -o /dev/null -w "root: %{http_code}\n" $(APP_URL)
	@echo "== history API (no auth must be 401 when APP_ACCESS_CODE is set) =="
	curl -s -o /dev/null -w "api without code: %{http_code}\n" "$(APP_URL)/api/attempts?limit=1"
ifneq ($(strip $(APP_ACCESS_CODE)),)
	@echo "== history API (with code must be 200) =="
	curl -s -w "\napi with code: %{http_code}\n" -H "x-app-access-code: $(APP_ACCESS_CODE)" "$(APP_URL)/api/attempts?limit=1"
else
	@echo "SKIP: APP_ACCESS_CODE not found in .env.local"
endif

doctor: check-unit
	@echo "== required prod env in unit =="
	@grep -q '^Environment=CLEARSPEAK_DATA_DIR=' $(UNIT_DST) \
		&& echo "OK: CLEARSPEAK_DATA_DIR present" \
		|| (echo "FAIL: CLEARSPEAK_DATA_DIR missing from $(UNIT_DST)"; exit 1)
	@echo "== access code configured =="
	@if [ -n "$(strip $(APP_ACCESS_CODE))" ]; then echo "OK: APP_ACCESS_CODE set (.env.local)"; \
	else echo "WARN: APP_ACCESS_CODE empty (API will 500 in production)"; fi
	@$(MAKE) --no-print-directory verify

status:
	sudo systemctl --no-pager status $(SERVICE).service | head -12
	sudo tailscale serve status

logs:
	sudo journalctl -u $(SERVICE).service -n 100 --no-pager

deploy: build restart serve verify
	@echo "deploy complete: $(SERVICE) on :$(PORT)"
