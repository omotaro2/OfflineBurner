import { open, unlink } from "node:fs/promises"

const CHUNK = 64 * 1024

/** Write the bytes into the existing file. Launcher's USB disk rejects Chrome's .crswap rename. */
export async function writeInPlace(filePath: string, data: Buffer): Promise<void> {
  const handle = await open(filePath, "w")
  try {
    let offset = 0
    while (offset < data.length) {
      const { bytesWritten } = await handle.write(data.subarray(offset, Math.min(offset + CHUNK, data.length)))
      if (bytesWritten <= 0) {
        const stalled = new Error("カードへの書き込みが止まりました") as NodeJS.ErrnoException
        stalled.code = "EIO"
        throw stalled
      }
      offset += bytesWritten
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/** Replace a file that FAT marked read-only, which otherwise comes back as a permission error. */
export async function writeCardFile(filePath: string, data: Buffer): Promise<void> {
  try {
    await writeInPlace(filePath, data)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "EACCES" && code !== "EPERM") throw error
    await unlink(filePath).catch(() => undefined)
    await writeInPlace(filePath, data)
  }
}

export async function syncDirectory(dir: string): Promise<void> {
  const handle = await open(dir, "r")
  try {
    await handle.sync()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "EINVAL" && code !== "ENOTSUP") throw error
  } finally {
    await handle.close()
  }
}
