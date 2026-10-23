'use strict';
/**
 * Native macOS menu bar. Navigation items set the web app's hash routes (the
 * same routes as the sidebar). Web shortcuts win over these accelerators when
 * the page handles the key (e.g. ⌘N in Notes creates a note).
 */
const { Menu, app } = require('electron');

const GO = [
  ['Today', 'today', 'CmdOrCtrl+1'],
  ['Inbox', 'inbox', 'CmdOrCtrl+2'],
  ['Upcoming', 'upcoming', 'CmdOrCtrl+3'],
  ['Projects', 'projects', 'CmdOrCtrl+4'],
  ['Notes', 'notes', 'CmdOrCtrl+5'],
  ['Calendar', 'calendar', 'CmdOrCtrl+6'],
  ['Journal', 'journal', 'CmdOrCtrl+7'],
  ['Iris (AI)', 'iris', 'CmdOrCtrl+8'],
  ['Insights', 'insights', 'CmdOrCtrl+9'],
  null,
  ['Goals', 'goals'],
  ['Habits', 'habits'],
  ['Milestones', 'milestones'],
  ['Daily Mapper', 'dailymapper'],
  ['Applications', 'applications'],
  ['Learning Vault', 'learningvault'],
  null,
  ['Search', 'search', 'CmdOrCtrl+Shift+F'],
];

function buildMenu({ navigate, quickAdd, openExternal, apiOrigin }) {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => navigate('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Task…', accelerator: 'CmdOrCtrl+N', click: quickAdd },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Go',
      submenu: GO.map((g) => (g ? { label: g[0], accelerator: g[2], click: () => navigate(g[1]) } : { type: 'separator' })),
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'ClearMind on the Web', click: () => openExternal(apiOrigin) },
        { label: 'Support', click: () => openExternal(`${apiOrigin}/support.html`) },
        { label: 'Privacy Policy', click: () => openExternal(`${apiOrigin}/privacy.html`) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu, GO };
