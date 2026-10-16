import '@testing-library/jest-dom/vitest';
import { installIntersectionObserverStub } from './intersectionObserverStub.js';

// jsdom has no IntersectionObserver; by default nothing ever scrolls into view.
installIntersectionObserverStub();
