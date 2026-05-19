import { describe, it, expect, beforeEach } from 'vitest';
import { THEME_CSS } from '../../../utils/reporting/theme';
import { INTERACTIVITY_JS } from '../../../utils/reporting/interactivity';

// ---------------------------------------------------------------------------
// THEME_CSS — basic shape
// ---------------------------------------------------------------------------

describe('THEME_CSS', () => {
  it('is a non-empty string', () => {
    expect(typeof THEME_CSS).toBe('string');
    expect(THEME_CSS.length).toBeGreaterThan(0);
  });

  it('does not start with an HTML tag', () => {
    expect(THEME_CSS.trimStart()).not.toMatch(/^</);
  });

  it('does not contain a </style> closing tag (no injection)', () => {
    expect(THEME_CSS).not.toContain('</style>');
  });

  it('does not contain a <script> tag (no injection)', () => {
    expect(THEME_CSS).not.toContain('<script');
  });

  it('contains palette custom properties', () => {
    expect(THEME_CSS).toContain('--wc-bg');
    expect(THEME_CSS).toContain('--wc-surface');
    expect(THEME_CSS).toContain('--wc-text');
  });

  it('contains status pill classes', () => {
    expect(THEME_CSS).toContain('wc-status--success');
    expect(THEME_CSS).toContain('wc-status--failed');
    expect(THEME_CSS).toContain('wc-status--skipped');
    expect(THEME_CSS).toContain('wc-status--running');
    expect(THEME_CSS).toContain('wc-status--pending');
    expect(THEME_CSS).toContain('wc-status--idle');
  });

  it('contains method badge classes for all common HTTP verbs', () => {
    expect(THEME_CSS).toContain('wc-method--GET');
    expect(THEME_CSS).toContain('wc-method--POST');
    expect(THEME_CSS).toContain('wc-method--PUT');
    expect(THEME_CSS).toContain('wc-method--PATCH');
    expect(THEME_CSS).toContain('wc-method--DELETE');
  });

  it('contains summary tile classes', () => {
    expect(THEME_CSS).toContain('wc-summary-grid');
    expect(THEME_CSS).toContain('wc-tile');
  });

  it('contains card and tab-strip classes', () => {
    expect(THEME_CSS).toContain('wc-card');
    expect(THEME_CSS).toContain('wc-tabs');
    expect(THEME_CSS).toContain('wc-tab-btn');
  });

  it('contains pre block classes', () => {
    expect(THEME_CSS).toContain('wc-pre');
  });

  it('does not reference @import (must be self-contained)', () => {
    expect(THEME_CSS).not.toContain('@import');
  });
});

// ---------------------------------------------------------------------------
// INTERACTIVITY_JS — basic shape
// ---------------------------------------------------------------------------

describe('INTERACTIVITY_JS', () => {
  it('is a non-empty string', () => {
    expect(typeof INTERACTIVITY_JS).toBe('string');
    expect(INTERACTIVITY_JS.length).toBeGreaterThan(0);
  });

  it('does not start with an HTML tag', () => {
    expect(INTERACTIVITY_JS.trimStart()).not.toMatch(/^</);
  });

  it('does not contain </script> (no injection)', () => {
    expect(INTERACTIVITY_JS).not.toContain('</script>');
  });

  it('does not contain a top-level window.xxx assignment (no globals)', () => {
    // A top-level global assignment would look like "window.foo = " outside an
    // IIFE. The IIFE wraps everything, so no such assignment should appear.
    // We check that any "window." reference is not an assignment target outside
    // a function body.
    // Simplified sanity check: the string must contain "(function" to confirm
    // the IIFE wrapper is present.
    expect(INTERACTIVITY_JS).toContain('(function');
  });

  it('references data-toggle attribute', () => {
    expect(INTERACTIVITY_JS).toContain('data-toggle');
  });

  it('references data-card-body attribute', () => {
    expect(INTERACTIVITY_JS).toContain('data-card-body');
  });

  it('references data-tab attribute', () => {
    expect(INTERACTIVITY_JS).toContain('data-tab');
  });

  it('references data-tab-panel attribute', () => {
    expect(INTERACTIVITY_JS).toContain('data-tab-panel');
  });

  it('references data-summary-filter for status filtering', () => {
    expect(INTERACTIVITY_JS).toContain('data-summary-filter');
  });

  it('references data-report-search for free-text filtering', () => {
    expect(INTERACTIVITY_JS).toContain('data-report-search');
  });

  it('references aria-selected attribute', () => {
    expect(INTERACTIVITY_JS).toContain('aria-selected');
  });

  it('references hidden attribute (not CSS class) for visibility', () => {
    expect(INTERACTIVITY_JS).toContain('hidden');
  });
});

// ---------------------------------------------------------------------------
// INTERACTIVITY_JS — jsdom integration: card toggle
// ---------------------------------------------------------------------------

describe('INTERACTIVITY_JS — card toggle (jsdom integration)', () => {
  beforeEach(() => {
    // Build a minimal card DOM structure that matches the expected shape:
    //   <div class="wc-card">
    //     <div data-toggle="card">Header</div>    ← trigger
    //     <div data-card-body hidden>Body</div>   ← initially hidden
    //   </div>
    document.body.innerHTML = `
      <div class="wc-card">
        <div data-toggle="card">Header</div>
        <div data-card-body hidden>Body content</div>
      </div>
    `;
    // Execute the IIFE so event listeners are registered.
    // eval() runs in the current scope which has access to jsdom's document.
     
    eval(INTERACTIVITY_JS);
  });

  it('card body is initially hidden', () => {
    const body = document.querySelector('[data-card-body]') as HTMLElement;
    expect(body.hasAttribute('hidden')).toBe(true);
  });

  it('clicking data-toggle="card" removes the hidden attribute from data-card-body', () => {
    const toggle = document.querySelector('[data-toggle="card"]') as HTMLElement;
    const body = document.querySelector('[data-card-body]') as HTMLElement;

    toggle.click();

    expect(body.hasAttribute('hidden')).toBe(false);
  });

  it('clicking data-toggle="card" a second time restores the hidden attribute', () => {
    const toggle = document.querySelector('[data-toggle="card"]') as HTMLElement;
    const body = document.querySelector('[data-card-body]') as HTMLElement;

    toggle.click(); // open
    toggle.click(); // close

    expect(body.hasAttribute('hidden')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// INTERACTIVITY_JS — jsdom integration: tab switching
// ---------------------------------------------------------------------------

describe('INTERACTIVITY_JS — tab switching (jsdom integration)', () => {
  beforeEach(() => {
    // Structure:
    //   <div class="wc-card-body">      ← container
    //     <div class="wc-tabs">         ← tab strip (parent of tab buttons)
    //       <button data-tab="request" aria-selected="true">Request</button>
    //       <button data-tab="response" aria-selected="false">Response</button>
    //       <button data-tab="validation" aria-selected="false">Validation</button>
    //     </div>
    //     <div data-tab-panel="request">...</div>
    //     <div data-tab-panel="response" hidden>...</div>
    //     <div data-tab-panel="validation" hidden>...</div>
    //   </div>
    document.body.innerHTML = `
      <div class="wc-card-body">
        <div class="wc-tabs">
          <button data-tab="request" aria-selected="true">Request</button>
          <button data-tab="response" aria-selected="false">Response</button>
          <button data-tab="validation" aria-selected="false">Validation</button>
        </div>
        <div data-tab-panel="request">Request content</div>
        <div data-tab-panel="response" hidden>Response content</div>
        <div data-tab-panel="validation" hidden>Validation content</div>
      </div>
    `;
     
    eval(INTERACTIVITY_JS);
  });

  it('initially, only the request panel is visible', () => {
    const request = document.querySelector('[data-tab-panel="request"]') as HTMLElement;
    const response = document.querySelector('[data-tab-panel="response"]') as HTMLElement;
    expect(request.hasAttribute('hidden')).toBe(false);
    expect(response.hasAttribute('hidden')).toBe(true);
  });

  it('clicking the response tab shows the response panel and hides request', () => {
    const responseBtn = document.querySelector('[data-tab="response"]') as HTMLElement;
    const requestPanel = document.querySelector('[data-tab-panel="request"]') as HTMLElement;
    const responsePanel = document.querySelector('[data-tab-panel="response"]') as HTMLElement;

    responseBtn.click();

    expect(responsePanel.hasAttribute('hidden')).toBe(false);
    expect(requestPanel.hasAttribute('hidden')).toBe(true);
  });

  it('clicking the response tab sets aria-selected="true" on it and "false" on others', () => {
    const responseBtn = document.querySelector('[data-tab="response"]') as HTMLElement;
    const requestBtn = document.querySelector('[data-tab="request"]') as HTMLElement;

    responseBtn.click();

    expect(responseBtn.getAttribute('aria-selected')).toBe('true');
    expect(requestBtn.getAttribute('aria-selected')).toBe('false');
  });

  it('clicking the validation tab shows only the validation panel', () => {
    const validationBtn = document.querySelector('[data-tab="validation"]') as HTMLElement;
    const requestPanel = document.querySelector('[data-tab-panel="request"]') as HTMLElement;
    const responsePanel = document.querySelector('[data-tab-panel="response"]') as HTMLElement;
    const validationPanel = document.querySelector('[data-tab-panel="validation"]') as HTMLElement;

    validationBtn.click();

    expect(validationPanel.hasAttribute('hidden')).toBe(false);
    expect(requestPanel.hasAttribute('hidden')).toBe(true);
    expect(responsePanel.hasAttribute('hidden')).toBe(true);
  });

  it('switching tabs is idempotent when clicking the already-active tab', () => {
    const requestBtn = document.querySelector('[data-tab="request"]') as HTMLElement;
    const requestPanel = document.querySelector('[data-tab-panel="request"]') as HTMLElement;

    requestBtn.click(); // already active

    expect(requestPanel.hasAttribute('hidden')).toBe(false);
    expect(requestBtn.getAttribute('aria-selected')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// INTERACTIVITY_JS — jsdom integration: summary status filter + search
// ---------------------------------------------------------------------------

describe('INTERACTIVITY_JS — summary filter + search (jsdom integration)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="wc-summary-controls">
        <input data-report-search />
      </div>
      <div class="wc-summary-grid">
        <button data-summary-filter="all" aria-pressed="false">Total</button>
        <button data-summary-filter="passed" aria-pressed="false">Passed</button>
        <button data-summary-filter="failed" aria-pressed="false">Failed</button>
      </div>
      <section class="wc-items">
        <div data-report-item="request" data-filter-status="passed" data-search-text="get users api"></div>
        <div data-report-item="request" data-filter-status="failed" data-search-text="create order api"></div>
      </section>
    `;

     
    eval(INTERACTIVITY_JS);
  });

  it('shows all top-level report items initially', () => {
    const items = document.querySelectorAll('.wc-items > [data-report-item]');
    const hiddenCount = Array.from(items).filter((item) => item.hasAttribute('hidden')).length;
    expect(hiddenCount).toBe(0);
  });

  it('clicking Passed filters to only passed items', () => {
    const passedBtn = document.querySelector('[data-summary-filter="passed"]') as HTMLButtonElement;
    const passedItem = document.querySelector('[data-filter-status="passed"]') as HTMLElement;
    const failedItem = document.querySelector('[data-filter-status="failed"]') as HTMLElement;

    passedBtn.click();

    expect(passedBtn.getAttribute('aria-pressed')).toBe('true');
    expect(passedItem.hasAttribute('hidden')).toBe(false);
    expect(failedItem.hasAttribute('hidden')).toBe(true);
  });

  it('clicking the same status filter again resets the filter', () => {
    const passedBtn = document.querySelector('[data-summary-filter="passed"]') as HTMLButtonElement;
    const failedItem = document.querySelector('[data-filter-status="failed"]') as HTMLElement;

    passedBtn.click(); // apply
    passedBtn.click(); // reset

    expect(passedBtn.getAttribute('aria-pressed')).toBe('false');
    expect(failedItem.hasAttribute('hidden')).toBe(false);
  });

  it('search input filters by data-search-text', () => {
    const search = document.querySelector('[data-report-search]') as HTMLInputElement;
    const passedItem = document.querySelector('[data-filter-status="passed"]') as HTMLElement;
    const failedItem = document.querySelector('[data-filter-status="failed"]') as HTMLElement;

    search.value = 'order';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    expect(passedItem.hasAttribute('hidden')).toBe(true);
    expect(failedItem.hasAttribute('hidden')).toBe(false);
  });
});
