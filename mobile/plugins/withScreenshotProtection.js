const { withMainActivity } = require('expo/config-plugins');

module.exports = function withScreenshotProtection(config) {
  return withMainActivity(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    const secureFlag = 'window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)';
    if (contents.includes(secureFlag)) return modConfig;

    const onCreateCall = /super\.onCreate\([^)]*\)/;
    if (!onCreateCall.test(contents)) {
      throw new Error('Could not locate the MainActivity onCreate call for screenshot protection.');
    }
    if (!contents.includes('import android.view.WindowManager')) {
      contents = contents.replace(
        /^(package [^\r\n]+\r?\n)/m,
        '$1\nimport android.view.WindowManager\n'
      );
    }
    if (!contents.includes('import android.view.WindowManager')) {
      throw new Error('Could not add the WindowManager import for screenshot protection.');
    }

    modConfig.modResults.contents = contents.replace(
      onCreateCall,
      match => `${match}\n    ${secureFlag}`
    );
    return modConfig;
  });
};
