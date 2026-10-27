# UI sizing and navigation

Trading charts display normalized OHLC candles only. Chart layer controls and chart-only trade/analysis drawings have been removed; market analysis, trade plans, risk levels, positions, and history remain available through their operational pages. Existing `user_preferences.chart_layers` values are ignored and left untouched.

`src/index.css` defines type tokens in `:root`: `--fs-2xs` 11px for secondary captions, `--fs-xs` 12px, `--fs-sm` 13px, `--fs-md` 14px, `--fs-lg` 16px, `--fs-xl` 20px, and `--fs-price` clamped from 24px to 32px. Use these tokens or rem/clamp values for new styles. Keep numeric data tabular.

The touch target token is `--tap: 44px`. Below 1024px, buttons, selects, inputs, textareas, and navigation controls use at least 44px height; form controls use 16px text to prevent iOS focus zoom.

Phone is below 640px, tablet is 640–1023px, and desktop starts at 1024px. Desktop always shows the expanded 248px sidebar. Phones and tablets use the fixed five-item bottom bar (Chart, Trader, Portfolio, Research, More); More lists the other pages and account actions in a safe-area-aware sheet. Add a primary destination in `PRIMARY` or a secondary destination in `MORE` in `src/components/MobileNavigation.tsx`, and add every page to `NAV_ITEMS` and `NAV_GROUPS` in `src/components/Sidebar.tsx` for desktop. Keep Admin visibility role-gated and server authorization intact.

Run `npm run check:ui-layout` to catch undersized font declarations and sidebar collapse code.
