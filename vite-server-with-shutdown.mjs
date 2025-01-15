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

    

    const ws = new WebSocket('ws://localhost:3000/events/');  // Change to the dynamic WebSocket port

    ws.onmessage = (event) => {
        console.log(event.data);
       
        if (event.data === "Shutdown") {
            viteServer.close().then(() => {
                // Optionally exit the process after Vite shuts down
                process.exit(0);
            });
        }
        
    };

 ws.onerror = (event) => {
	 console.log(event.data);

};


})();
