import '@testing-library/jest-dom/vitest';

// jsdom has no layout, so scrolling the window does nothing instead of logging "not implemented".
window.scrollTo = () => undefined;
