const { withMainActivity } = require('expo/config-plugins');

// Some launchers do not fall back to the application icon for a task whose
// description has no bitmap. Supply one explicitly, including adaptive icons.
module.exports = function withRecentsIcon(config) {
  return withMainActivity(config, (config) => {
    const marker = '// Web Notes recent-apps icon';
    if (config.modResults.contents.includes(marker)) return config;
    const anchor = 'super.onCreate(null)';
    if (!config.modResults.contents.includes(anchor)) {
      throw new Error('Could not configure the recent-apps icon: MainActivity onCreate changed.');
    }
    config.modResults.contents = config.modResults.contents.replace(anchor, `${anchor}
    ${marker}
    val taskIcon = packageManager.getApplicationIcon(applicationInfo)
    val iconSize = (64 * resources.displayMetrics.density).toInt().coerceAtLeast(1)
    val bitmap = android.graphics.Bitmap.createBitmap(iconSize, iconSize, android.graphics.Bitmap.Config.ARGB_8888)
    taskIcon.setBounds(0, 0, iconSize, iconSize)
    taskIcon.draw(android.graphics.Canvas(bitmap))
    @Suppress("DEPRECATION")
    setTaskDescription(android.app.ActivityManager.TaskDescription(getString(R.string.app_name), bitmap))`);
    return config;
  });
};
