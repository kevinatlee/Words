# Words on Unraid

Words is a self-hosted real-time letter-grid party game built for one shared display and a room full of phones.

The official container is a single stateless service. It does not require a database, Redis, appdata volume, or user accounts. Active rooms, reconnect state, and round data are intentionally kept in memory and are cleared when the container restarts.

## Install from Community Applications

1. Open **Apps** in the Unraid WebUI.
2. Search for **Words**.
3. Review the template and choose the host port. The default is `6532`.
4. Click **Install** / **Apply**.
5. Open the Words WebUI from the Docker page.

## Start a game

1. Open the Words WebUI on the TV, shared display, or browser you want everyone to watch.
2. Words creates a temporary room and shows the room join information.
3. Players open the room link or scan the QR code on their phones.
4. The first player becomes the initial game host and can choose the board size and round length.
5. Start the round and play from the phones while the shared display shows the common board and results.

## Networking

Words serves its web interface, API, and Socket.IO/WebSocket traffic from the same container port: `6532`.

For normal LAN play, every phone and shared display only needs to be able to reach the Unraid server and the mapped Words port.

If you publish Words through a reverse proxy or tunnel, proxy the complete origin so normal HTTP requests and WebSocket/Socket.IO traffic reach the same Words container. HTTPS termination can happen at the proxy or tunnel.

## Persistent storage

No persistent Docker volume is required.

This is intentional: Words is designed around temporary drop-in rooms rather than accounts, campaigns, saved matches, or long-term player history. Restarting or replacing the container clears all active rooms.

## Updates

The Community Applications template tracks:

`ghcr.io/kevinatlee/words:latest`

The `latest` image is published from the tested `main` branch release workflow. Use Unraid's normal Docker update mechanism to pull newer images.

## Health check

The container exposes:

`GET /api/health`

on the same mapped WebUI port.

## Support and source

Source code, issues, and development history are maintained at:

https://github.com/kevinatlee/Words

Report bugs or request features at:

https://github.com/kevinatlee/Words/issues

## License

Words is released under the MIT License. Third-party game-data notices are included in `THIRD_PARTY_NOTICES.md` in the project repository.
