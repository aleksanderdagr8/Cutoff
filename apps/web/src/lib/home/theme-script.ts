import { HOME_THEME_STORAGE_KEY } from "./theme";

/** Inline before-paint bootstrap — keep tiny; no imports at runtime. */
export const HOME_THEME_BOOTSTRAP = `(function(){try{var k=${JSON.stringify(HOME_THEME_STORAGE_KEY)};var p=localStorage.getItem(k);var dark=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.homeTheme=dark?"dark":"light";}catch(e){}})();`;
