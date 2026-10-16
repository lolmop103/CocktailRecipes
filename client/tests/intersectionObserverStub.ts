/**
 * jsdom has no IntersectionObserver. This stub records every observer so a
 * test can decide when the sentinel "scrolls into view".
 */
export interface ObserverStub {
  instances: StubObserver[];
  /** Reports every observed element of every live observer as (not) intersecting. */
  fire: (isIntersecting?: boolean) => void;
}

export class StubObserver {
  readonly targets = new Set<Element>();
  disconnected = false;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit | undefined,
  ) {}

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.disconnected = true;
    this.targets.clear();
  }

  trigger(isIntersecting: boolean) {
    const entries = Array.from(
      this.targets,
      (target) => ({ target, isIntersecting }) as IntersectionObserverEntry,
    );
    if (entries.length > 0) {
      this.callback(entries, this as unknown as IntersectionObserver);
    }
  }
}

export function installIntersectionObserverStub(): ObserverStub {
  const stub: ObserverStub = {
    instances: [],
    fire: (isIntersecting = true) => {
      for (const observer of stub.instances) {
        if (!observer.disconnected) observer.trigger(isIntersecting);
      }
    },
  };
  globalThis.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      const observer = new StubObserver(callback, options);
      stub.instances.push(observer);
      return observer;
    }
  } as unknown as typeof IntersectionObserver;
  return stub;
}
