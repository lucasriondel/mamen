export type DatabasePort = {
  open: () => Promise<void>
  close: () => Promise<void>
  delete: () => Promise<void>
}
