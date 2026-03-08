import type * as vscode from "vscode"
import type { HostMessage } from "./types"

export async function postToWebview(webview: vscode.Webview, message: HostMessage) {
  await webview.postMessage(message)
}
