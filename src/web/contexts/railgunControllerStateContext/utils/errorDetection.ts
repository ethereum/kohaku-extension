// Rate-limit helpers JUST for getAllLogs (local, no other changes)

// Detect Infura-style "Too Many Requests" even when wrapped
export const isTooManyRequests = (e: any) => {
  const code = e?.code
  const msg = String(e?.message || e?.error?.message || '')
  const dataMsg = String(e?.error?.data || '')
  return code === 429 || /too many requests/i.test(msg) || /too many requests/i.test(dataMsg)
}

// Ethers/Infura sometimes returns range-ish errors with -32001 or phrases
// (you already had this; keeping it as a separate helper)
export const isRangeErr = (e: any) => {
  return (
    e?.error?.code === -32001 ||
    /failed to resolve block range/i.test(String(e?.error?.message || e?.message || ''))
  )
}
