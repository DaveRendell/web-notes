const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The DOM editor currently reuses website plugins. These imports must stay
// inside the DOM bundle; native/Hermes code must not load them directly.
config.watchFolders = [path.resolve(__dirname, '../web/src')];

const imageContext = path.resolve(__dirname, '../web/src/contexts/ImageContext.tsx');
const calendarContext = path.resolve(__dirname, '../web/src/contexts/CalendarContext.tsx');
const noteImage = path.resolve(__dirname, '../web/src/components/NoteImage.tsx');
const richCalendarNode = path.resolve(__dirname, '../web/src/components/RichCalendarNode.tsx');
const websiteSource = `${path.resolve(__dirname, '../web/src')}${path.sep}`;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (context.originModulePath === noteImage && moduleName === '../contexts/ImageContext') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'shims/ImageContext.ts') };
  }
  if (context.originModulePath.startsWith(websiteSource) && moduleName === '../contexts/ImageContext') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'shims/ImageContext.ts') };
  }
  if (context.originModulePath.startsWith(websiteSource) && moduleName === '../contexts/CalendarContext') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'shims/CalendarContext.ts') };
  }
  if (context.originModulePath === richCalendarNode && moduleName === './CalendarWidget') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'shims/CalendarWidget.tsx') };
  }
  if (context.originModulePath === imageContext) {
    throw new Error('The web image service must not enter the Android editor bundle.');
  }
  if (context.originModulePath === calendarContext) {
    throw new Error('The web Calendar service must not enter the Android editor bundle.');
  }
  if (context.originModulePath.startsWith(websiteSource) && !moduleName.startsWith('.') && !path.isAbsolute(moduleName)) {
    // Keep a single React/Lexical/MDXEditor instance across the imported web
    // plugins and this isolated Expo app. Package-internal nested dependencies
    // still use normal hierarchical lookup.
    return context.resolveRequest({ ...context, originModulePath: path.resolve(__dirname, 'EditorSurface.tsx') }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
