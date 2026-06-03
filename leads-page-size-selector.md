# Leads Page Size Selector

## Goal
Add `10`, `25`, and `50` page-size controls to admin `Leads` and agent `My Leads`, with `10` as the default on both pages.

## Tasks
- [ ] Replace fixed page-size constants with local page-size state on both leads pages. → Verify: both pages initialize at `10` and use that value in the leads query `limit`.
- [ ] Add the selected page size to query keys and pagination calculations. → Verify: total pages and visible range text update correctly when page size changes.
- [ ] Add a compact `Rows per page` selector to admin leads and to agent desktop/mobile pagination areas. → Verify: users can switch between `10`, `25`, and `50` on both pages.
- [ ] Reset to page `1` whenever page size changes. → Verify: changing page size returns the list to the first page.
- [ ] Run frontend build validation. → Verify: `npm --prefix frontend run build` passes.

## Done When
- [ ] Admin leads and agent `My Leads` both default to `10` rows per page.
- [ ] Both pages expose `10`, `25`, and `50` page-size options.
- [ ] Pagination and counts stay correct after page-size changes.
