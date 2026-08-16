const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
    const win = new BrowserWindow(
        {
            width: 1280,
            height: 720,
            title: "HTML Designer",
            autoHideMenuBar: true,
        }
    );

    win.loadFile(
        path.join(__dirname, "../dist/index.html")
    );
}

app.whenReady().then(createWindow);
