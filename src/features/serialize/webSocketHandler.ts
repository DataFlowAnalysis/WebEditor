import { getModelFileName, logger, setModelSource, loadingIndicator } from "../../index";
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
        loadingIndicator.hideIndicator();
        initWebSocket();
    };

    ws.onerror = () => {
        logger.log(ws, "WebSocket encountered an error. Reconnecting...");
        loadingIndicator.hideIndicator();
        initWebSocket();
    };

    ws.onmessage = (event) => {
        logger.log(ws, "WebSocketID:", wsId);
        logger.log(ws, event.data);

        // Example of specific handling for certain messages:
        if (event.data === "Error:Cycle") {
            alert("Error analyzing model: Model terminates in cycle!");
            loadingIndicator.hideIndicator();
            return;
        }
        if (event.data.startsWith("ID assigned:")) {
            wsId = parseInt(event.data.split(":")[1].trim(), 10);
            loadingIndicator.hideIndicator();
            return;
        }
        if (event.data === "Shutdown") {
            loadingIndicator.hideIndicator();
            return;
        }
        if (event.data.trim().endsWith("</datadictionary:DataDictionary>")) {
            const saveDFDandDD = new SaveDFDandDD(event.data);
            saveDFDandDD.saveDiagramAsDFD();
            loadingIndicator.hideIndicator();
            return;
        }

        // Otherwise, treat incoming data as JSON for model source:
        setModelSource(
            new File([new Blob([event.data], { type: "application/json" })], getModelFileName() + ".json", {
                type: "application/json",
            }),
        );
        loadingIndicator.hideIndicator();
    };
}

export function sendMessage(message: string) {
    ws.send(wsId + ":" + message);
}

// Initialize immediately upon module load
initWebSocket();
