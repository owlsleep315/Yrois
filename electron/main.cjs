const { app, BrowserWindow, screen } = require("electron");

const isDev = !app.isPackaged;
const DEV_SERVER_URL = "http://localhost:5173";

let adminWindow;
let displayWindow;

console.log("Electron main.js started");

function createWindows() {
  console.log("createWindows called");
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  const secondaryDisplay =
    displays.find((display) => display.id !== primaryDisplay.id) || primaryDisplay;

  adminWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width: 1200,
    height: 800,
    title: "승하차 보조 등록 화면",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  displayWindow = new BrowserWindow({
    x: secondaryDisplay.bounds.x,
    y: secondaryDisplay.bounds.y,
    width: secondaryDisplay.bounds.width,
    height: secondaryDisplay.bounds.height,
    title: "승하차 보조 표시 화면",
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  adminWindow.loadURL(`${DEV_SERVER_URL}/admin`);
  displayWindow.loadURL(`${DEV_SERVER_URL}/display`);

  if (isDev) {
    adminWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(createWindows);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindows();
});