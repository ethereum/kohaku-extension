/** The blocks a log scan covers, both included; with no last block it runs to `latest`. */
export interface LogScan {
  from: number
  to?: number
}
