/**
 * A copy to the clipboard with its feedback: which text was copied, and
 * whether the clipboard took it.
 */
import { useCallback, useState } from 'react'

import { setStringAsync } from '@common/utils/clipboard'

import type { CopyFeedback, CopyHook } from './types'

const useCopy = (): CopyHook => {
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null)
  const copy = useCallback((what: string, text: string) => {
    setStringAsync(text)
      .then((copied) => setFeedback({ what, copied }))
      .catch(() => setFeedback({ what, copied: false }))
  }, [])
  return { feedback, copy }
}

export default useCopy
