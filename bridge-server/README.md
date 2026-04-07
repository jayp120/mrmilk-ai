# MrMilk x Pomelli Bridge Server

Runs the local queue that connects the MrMilk AI app and the Chrome extension.

## Start

```bash
cd bridge-server
npm install
npm start
```

Server URL:

`http://localhost:3456`

Health check:

`http://localhost:3456/health`

Key endpoints:

- `POST /trigger`
- `GET /pending`
- `POST /result`
- `GET /result/:jobId`
- `DELETE /jobs`

The Chrome extension should keep polling `GET /pending` every 3 seconds.
