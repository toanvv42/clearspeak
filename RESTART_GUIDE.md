# ClearSpeak staging restart guide

Use this guide after changing the app or when restarting the staging server.

## 1. Go to the project

```bash
cd /home/ubuntu/apps/pronunciation-coach-staging
```

## 2. Build the production app

This service runs `next start`, so it needs a production build first. Use webpack mode:

```bash
npx next build --webpack
```

If the build succeeds, continue. Do not restart the service after a failed build unless an older build is intentionally being used.

## 3. Restart the app service

```bash
sudo systemctl daemon-reload
sudo systemctl restart clearspeak-staging.service
sudo systemctl is-active clearspeak-staging.service
```

The service should report `active`. It runs the app on `127.0.0.1:3444`.

## 4. Configure or restore Tailscale access

The following command exposes the app privately to the tailnet at port `3444` and keeps the rule after restarts:

```bash
sudo tailscale serve --bg --https=3444 http://127.0.0.1:3444
```

Check the forwarding rule:

```bash
sudo tailscale serve status
```

Expected mapping:

```text
https://<machine-name>.ts.net:3444/
|-- proxy http://127.0.0.1:3444
```

## 5. Verify locally

```bash
curl -I http://127.0.0.1:3444
sudo systemctl --no-pager status clearspeak-staging.service
```

An HTTP response such as `200` or `307` confirms that Next.js is responding.

## If Tailscale says the listener already exists

Inspect the current rules:

```bash
sudo tailscale serve status
```

If port `3444` points to an old local port, remove only that listener and recreate it:

```bash
sudo tailscale serve --https=3444 off
sudo tailscale serve --bg --https=3444 http://127.0.0.1:3444
```

If a previous foreground `tailscale serve` command is still running, find it:

```bash
ps -eo pid,ppid,user,args | rg '[t]ailscale serve'
```

Stop only the stale `tailscale serve` process by its PID, then run the background command again:

```bash
sudo kill <stale-process-pid>
sudo tailscale serve --bg --https=3444 http://127.0.0.1:3444
```

## Restart Tailscale itself

Usually restarting the app is enough. To restart the Tailscale daemon too:

```bash
sudo systemctl restart tailscaled
sudo tailscale status
sudo tailscale serve status
```

Tailscale Serve background rules are designed to resume after a Tailscale restart.

## Useful logs

```bash
sudo journalctl -u clearspeak-staging.service -n 100 --no-pager
sudo journalctl -u clearspeak-staging.service -f
```

The app is tailnet-only; it is not exposed publicly through the internet.
