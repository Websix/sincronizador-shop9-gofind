module.exports = {
  transpileDependencies: ["vuetify"],
  pluginOptions: {
    electronBuilder: {
      nodeIntegration: true,
      builderOptions: {
        extraResources: [
          'src/assets/tray-icon.png',
          'src/assets/tray-icon-light.png'
        ]
      }
    }
  }
};
