module.exports = {
  apps: [
    {
      name: "mezana-finance",
      script: "/srv/data/apps/mezana-platform/apps/finance-bff/server.mjs",
      cwd: "/srv/data/apps/mezana-platform/apps/finance",
      interpreter: "/usr/bin/node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        FINANCE_PORT: "3000",
        FINANCE_ALT_PORT: "8005"
      }
    },
    {
      name: "mezana-gate-detector",
      script: "/srv/data/apps/mezana-platform/apps/finance-bff/gate_entry_detector.py",
      cwd: "/srv/data/apps/mezana-platform/apps/finance-bff",
      interpreter: "/srv/data/apps/mezana-platform/apps/finance-bff/.venv/bin/python",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false
    },
    {
      name: "mezana-telegram-bot",
      script: "/srv/data/apps/mezana-platform/apps/telegram-bot/dist/index.js",
      cwd: "/srv/data/apps/mezana-platform/apps/telegram-bot",
      interpreter: "/usr/bin/node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false
    }
  ]
};
