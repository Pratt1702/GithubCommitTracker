module.exports = {
  appId: 'com.faculty.committracker',
  productName: 'CommitTracker',
  copyright: `© ${new Date().getFullYear()} CommitTracker`,
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  files: ['dist/**/*', 'dist-electron/**/*'],
  win: {
    target: ['nsis', 'portable'],
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
