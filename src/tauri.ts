export const ERR_NOT_IN_TAURI = 'ERR_NOT_IN_TAURI';

function getIPC(): { invoke: Function } | null {
  try {
    const internals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    if (internals && typeof internals === 'object') {
      const ipc = (internals as Record<string, unknown>).invoke;
      if (typeof ipc === 'function') {
        return { invoke: ipc as Function };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function isInTauri(): boolean {
  return getIPC() !== null;
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const ipc = getIPC();
  if (!ipc) {
    throw new Error(ERR_NOT_IN_TAURI);
  }
  return ipc.invoke(cmd, args) as Promise<T>;
}

export async function openUrl(url: string): Promise<void> {
  const ipc = getIPC();
  if (!ipc) {
    window.open(url, '_blank');
    return;
  }
  await ipc.invoke('plugin:shell|open', { path: url });
}

export async function minimizeWindow(): Promise<void> {
  const ipc = getIPC();
  if (!ipc) return;
  await ipc.invoke('plugin:window|minimize');
}

export async function closeWindow(): Promise<void> {
  const ipc = getIPC();
  if (!ipc) return;
  await ipc.invoke('plugin:window|close');
}

export async function setWindowSize(width: number, height: number): Promise<void> {
  const ipc = getIPC();
  if (!ipc) return;
  await ipc.invoke('plugin:window|set_size', { value: { Logical: { width, height } } }).catch(() => {});
}
