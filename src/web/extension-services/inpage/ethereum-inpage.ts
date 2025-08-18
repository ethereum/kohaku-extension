if (/Opera|OPR\//i.test(navigator.userAgent)) {
  window.ethereum = new Proxy(window.ambire, { get: (t, p, r) => Reflect.get(t, p, r) })
} else {
  const d = Object.getOwnPropertyDescriptor(window, 'ethereum')
  let isDapp = false

  if (!d || d.configurable) {
    Object.defineProperty(window, 'ethereum', {
      configurable: false,
      enumerable: true,
      get: () => {
        if (!isDapp) {
          try {
            // throw an Error to determine the source of the request
            throw new Error()
          } catch (error: any) {
            const stack = error?.stack // Parse the stack trace to get the caller info
            if (stack) {
              const callerPage = (typeof stack === 'string' && stack.split('\n')[2]?.trim()) || ''
              if (callerPage.includes(window.location.hostname)) {
                try {
                  isDapp = true
                  // Send a request to the background's dapp session to notify that this page is a dApp
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  window.ambire.request({ method: 'eth_chainId', params: [] })
                } catch (e) {
                  // silent fail
                }
              }
            }
          }
        }

        return window.ambire
      },
      set: () => {}
    })
  }
  window.web3 ||= { currentProvider: window.ambire }
}
window.dispatchEvent(new Event('ethereum#initialized'))
