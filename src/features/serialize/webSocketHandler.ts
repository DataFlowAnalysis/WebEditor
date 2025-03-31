import { getModelFileName, logger, setModelSource } from "../../index";
import { SaveDFDandDD } from "./saveDFDandDD";

const webSocketAdress = `wss://websocket.dataflowanalysis.org/events/`;

let ws: WebSocket;
let wsId = 0;

/**
 * Initializes the WebSocket and sets up all event handlers.
 */
function initWebSocket() {
    ws = new WebSocket(webSocketAdress);

    ws.onopen = () => {
        logger.log(ws, "WebSocket connection established.");
    };

    ws.onclose = () => {
        logger.log(ws, "WebSocket connection closed. Reconnecting...");
        initWebSocket();
    };

    ws.onerror = () => {
        logger.log(ws, "WebSocket encountered an error. Reconnecting...");
        initWebSocket();
    };

    ws.onmessage = (event) => {
        logger.log(ws, "WebSocketID:", wsId);
        logger.log(ws, event.data);

        // Example of specific handling for certain messages:
        if (event.data === "Error:Cycle") {
            alert("Error analyzing model: Model terminates in cycle!");
            return;
        }
        if (event.data.startsWith("ID assigned:")) {
            wsId = parseInt(event.data.split(":")[1].trim(), 10);
            return;
        }
        if (event.data === "Shutdown") {
            return;
        }
        if (event.data.trim().endsWith("</datadictionary:DataDictionary>")) {
            const saveDFDandDD = new SaveDFDandDD(event.data);
            saveDFDandDD.saveDiagramAsDFD();
            return;
        }

        // Otherwise, treat incoming data as JSON for model source:
        setModelSource(
            new File([new Blob([event.data], { type: "application/json" })], getModelFileName() + ".json", {
                type: "application/json",
            }),
        );
    };
}

export function sendMessage(message: string) {
    ws.send(wsId + ":" + message);
}

// Initialize immediately upon module load
initWebSocket();
