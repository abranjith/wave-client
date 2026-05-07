/**
 * Self-contained interactivity script for Wave Client HTML reports.
 *
 * **Security contract**: This constant must never interpolate dynamic data.
 * It is embedded verbatim inside a `<script>` block by `renderShell()`.
 * The script only reads and mutates HTML attributes (`hidden`, `aria-selected`)
 * — it never reads or writes DOM text content, and never constructs or
 * evaluates strings from user data.
 *
 * **DOM contracts**:
 * - Card toggle: a `[data-toggle="card"]` element and its sibling
 *   `[data-card-body]` must share the same parent element.
 * - Tab switching: `[data-tab="<name>"]` buttons must be grouped inside a
 *   tab strip element; corresponding `[data-tab-panel="<name>"]` panels must
 *   be siblings of that tab strip (both direct children of the same container).
 *
 * The IIFE is function-scoped — it introduces no globals.
 */
export const INTERACTIVITY_JS = `
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Card toggle — data-toggle="card" / data-card-body                  */
  /* ------------------------------------------------------------------ */

  document.querySelectorAll('[data-toggle="card"]').forEach(function (toggle) {
    toggle.addEventListener('click', function () {
      var parent = toggle.parentElement;
      if (!parent) return;
      var body = parent.querySelector('[data-card-body]');
      if (!body) return;
      if (body.hasAttribute('hidden')) {
        body.removeAttribute('hidden');
      } else {
        body.setAttribute('hidden', '');
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Tab switching — data-tab / data-tab-panel                          */
  /* ------------------------------------------------------------------ */

  document.querySelectorAll('[data-tab]').forEach(function (tabBtn) {
    tabBtn.addEventListener('click', function () {
      var tab = tabBtn.getAttribute('data-tab');
      var tabStrip = tabBtn.parentElement;
      if (!tabStrip) return;

      /* Deactivate all sibling tab buttons in this strip */
      tabStrip.querySelectorAll('[data-tab]').forEach(function (btn) {
        btn.setAttribute('aria-selected', 'false');
      });
      tabBtn.setAttribute('aria-selected', 'true');

      /* Show / hide matching panels (siblings of the tab strip) */
      var container = tabStrip.parentElement;
      if (!container) return;
      container.querySelectorAll('[data-tab-panel]').forEach(function (panel) {
        if (panel.getAttribute('data-tab-panel') === tab) {
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', '');
        }
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Report filters — summary status toggles + free-text search         */
  /* ------------------------------------------------------------------ */

  var reportItems = Array.prototype.slice.call(
    document.querySelectorAll('.wc-items > [data-report-item]')
  );
  var summaryFilterButtons = Array.prototype.slice.call(
    document.querySelectorAll('[data-summary-filter]')
  );
  var searchInput = document.querySelector('[data-report-search]');

  var activeStatusFilter = null;
  var activeSearchTerm = '';

  function applyReportFilters() {
    reportItems.forEach(function (item) {
      var itemStatus = item.getAttribute('data-filter-status') || 'other';
      var searchText = (item.getAttribute('data-search-text') || '').toLowerCase();

      var matchesStatus = activeStatusFilter === null || itemStatus === activeStatusFilter;
      var matchesSearch =
        activeSearchTerm.length === 0 || searchText.indexOf(activeSearchTerm) !== -1;

      if (matchesStatus && matchesSearch) {
        item.removeAttribute('hidden');
      } else {
        item.setAttribute('hidden', '');
      }
    });
  }

  function updateSummaryButtons() {
    summaryFilterButtons.forEach(function (btn) {
      var filter = btn.getAttribute('data-summary-filter');
      var isPressed = activeStatusFilter !== null && filter === activeStatusFilter;

      btn.setAttribute('aria-pressed', isPressed ? 'true' : 'false');
      if (isPressed) {
        btn.classList.add('wc-tile-label-btn--active');
      } else {
        btn.classList.remove('wc-tile-label-btn--active');
      }
    });
  }

  summaryFilterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var selected = btn.getAttribute('data-summary-filter');

      if (!selected || selected === 'all') {
        activeStatusFilter = null;
      } else if (activeStatusFilter === selected) {
        activeStatusFilter = null;
      } else {
        activeStatusFilter = selected;
      }

      updateSummaryButtons();
      applyReportFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      activeSearchTerm = (searchInput.value || '').trim().toLowerCase();
      applyReportFilters();
    });
  }

  updateSummaryButtons();
  applyReportFilters();

})();
`.trim();
