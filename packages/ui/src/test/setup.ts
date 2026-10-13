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
}
