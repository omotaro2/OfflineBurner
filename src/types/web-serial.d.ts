interface SerialPort {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number; bufferSize?: number }): Promise<void>
  close(): Promise<void>
  getInfo(): { usbVendorId?: number; usbProductId?: number }
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>
  getSignals?(): Promise<{ dataTerminalReady?: boolean; requestToSend?: boolean }>
}

interface Navigator {
  serial: {
    requestPort(): Promise<SerialPort>
  }
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

interface Window {
  showDirectoryPicker(options?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>
}
