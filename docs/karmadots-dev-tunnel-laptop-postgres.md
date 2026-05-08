# Dev Mac → laptop Postgres (SSH tunnel, option A)

Use this when you want **one database** (the laptop’s `karmadots` / JewelHeart data) while running **`private-server`** or tools on your **dev Mac**.

## 1. Start the tunnel (keep this terminal open)

From **JewelHeartAdminFunction** (or any path):

```bash
chmod +x scripts/karmadots-laptop-postgres-tunnel.sh   # once
./scripts/karmadots-laptop-postgres-tunnel.sh
```

Defaults:

- SSH **`Host laptop`** from `~/.ssh/config`
- Local port **`5433`** → laptop **`127.0.0.1:5432`**

Override:

```bash
TUNNEL_LOCAL_PORT=5434 KARMADOTS_SSH_HOST=laptop ./scripts/karmadots-laptop-postgres-tunnel.sh
```

## 2. Point `DATABASE_URL` at the tunnel

On the **dev Mac**, in the shell where you start **`private-server`** (or `psql`):

1. Open **`~/private-server/.env` on the laptop** (via `ssh laptop 'grep ^DATABASE_URL= ~/private-server/.env'`) and note **user** and **database name** (often `karmadots`).
2. Swap **host** for **`127.0.0.1`** and **port** for your tunnel port (default **`5433`**).

Example (no password, same as typical local Homebrew):

```bash
export DATABASE_URL="postgresql://kevinwoods@127.0.0.1:5433/karmadots"
```

Then start Node from **`private-server`** as usual. All reads/writes go to **laptop Postgres**.

## 3. Stop

- In the tunnel terminal: **Ctrl+C**.
- If you used **`ssh -f`**: find the process and kill it (`ps aux | grep 'ssh.*5433'`).

## Notes

- The laptop must be **reachable** (`ssh laptop` works).
- **Do not commit** a `.env` that embeds the tunnel URL unless the whole team uses the same workflow.
- If **port 5433** is busy, set **`TUNNEL_LOCAL_PORT`** to another free port and match it in **`DATABASE_URL`**.
