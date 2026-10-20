// Browser APIs jsdom lacks, for every jsdom test. Layout stays jsdom's (every
// size zero); a test that needs sizes fakes them itself, such as mockListLayout.
if (typeof window !== 'undefined') {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.getAnimations ??= () => []
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.scrollTo ??= function (this: Element, options?: ScrollToOptions | number) {
    if (typeof options === 'object' && options.top !== undefined) {
      this.scrollTop = options.top
    }
  } as Element['scrollTo']
}
