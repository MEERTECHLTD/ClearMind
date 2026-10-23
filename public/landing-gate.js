/*
 * First visit to the bare home URL shows the landing page (/welcome/).
 * Anyone who has opened the app in this browser before (the app stores its
 * theme in localStorage on start), any deep link (#route or ?query), the
 * installed PWA and the desktop app go straight to the app. Classic script in
 * <head> so the redirect happens before the app bundle downloads.
 */
(function () {
  try {
    var l = window.location;
    if (l.pathname !== '/' || l.search || l.hash) return;
    if (window.clearmindDesktop || window.navigator.standalone) return;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
    var s = window.localStorage;
    if (s.getItem('theme') || s.getItem('cm.themePref')) return;
    l.replace('/welcome/');
  } catch (e) { /* storage blocked: stay on the app */ }
})();
