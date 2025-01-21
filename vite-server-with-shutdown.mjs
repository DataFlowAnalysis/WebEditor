import { createServer } from 'vite';
import { WebSocket } from 'ws';

(async () => {
    // Create a Vite server instance
    const viteServer = await createServer({
	server: {
		host: "0.0.0.0"
	}
});
    const serverInfo = await viteServer.listen();

    const address = serverInfo.httpServer?.address();
    if (typeof address === 'object' && address !== null) {
        console.log(`Vite server is running on http://localhost:${address.port}/`);
    }



})();
