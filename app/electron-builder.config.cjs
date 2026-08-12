module.exports = {
  appId: 'com.faculty.committracker',
  productName: 'CommitTracker',
  copyright: `© ${new Date().getFullYear()} CommitTracker`,
  // Build the GitHub-releases YAML so a tagged release becomes the update feed.
  publish: {
    provider: 'github',
    owner: 'Pratt1702',
    repo: 'GithubCommitTracker',
  },
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  // electron-updater ships a tiny runtime that must travel inside the app.asar.
  files: ['dist/**/*', 'dist-electron/**/*', '!**/*.map'],
  // Keep the auto-updater's helpers out of asar so it can self-replace on Windows.
  asarUnpack: ['**/node_modules/electron-updater/**', '**/node_modules/builder-util-runtime/**'],
  win: {
    target: ['nsis'],
    icon: 'build/icon.png',
    requestedExecutionLevel: 'asInvoker',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'CommitTracker',
  },
  linux: {
    target: ['AppImage', 'deb'],
    executableArgs: ['--ozone-platform=x11'],
    icon: 'build/icon.png',
    category: 'Education',
    maintainer: 'CommitTracker <faculty@example.com>',
    description: 'Faculty dashboard for tracking student GitHub contribution activity.',
  },
  appImage: {
    artifactName: 'CommitTracker.${ext}',
  },
  mac: {
    target: ['dmg'],
    icon: 'build/icon.png',
    category: 'public.app-category.education',
  },
};
