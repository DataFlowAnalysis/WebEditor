import { modelFileName, setModelSource } from "../..";
import { SaveDFDandDD } from "./saveDFDandDD";

export const ws = new WebSocket(`wss://webeditor.t-hueller.de/events/`); // Change to the dynamic WebSocket port
export var wsId = 0;

ws.onmessage = (event) => {
    console.log(event.data);
    if (event.data === "Error:Cycle") {
        alert("Error analyzing model: Model terminates in cycle!");
        return;
    }
    if (event.data.startsWith("ID assigned:")) {
        // Extract the ID from the message
        wsId = parseInt(event.data.split(":")[1].trim(), 10);
        return; // Exit after assigning the ID
    }
    if (event.data === "Shutdown") {
        return;
    }
    if (event.data.trim().endsWith("</datadictionary:DataDictionary>")) {
        var saveDFDandDD = new SaveDFDandDD(event.data);
        saveDFDandDD.saveFiles();
        return;
    }
    setModelSource(
        new File([new Blob([event.data], { type: "application/json" })], modelFileName + ".json", {
            type: "application/json",
        }),
    );
};
