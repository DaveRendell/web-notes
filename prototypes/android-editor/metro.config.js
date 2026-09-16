const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// This disposable package is intentionally not an npm workspace yet. It
// imports the website's actual rich Markdown plugins without putting them in
// the native/Hermes entry graph.
config.watchFolders = [path.resolve(__dirname, '../../src')];

const imageContext = path.resolve(__dirname, '../../src/contexts/ImageContext.tsx');
const noteImage = path.resolve(__dirname, '../../src/components/NoteImage.tsx');
const richCalendarNode = path.resolve(__dirname, '../../src/components/RichCalendarNode.tsx');
const websiteSource = `${path.resolve(__dirname, '../../src')}${path.sep}`;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (context.originModulePath === noteImage && moduleName === '../contexts/ImageContext') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'shims/ImageContext.ts') };
  }
  if (context.originModulePath === richCalendarNode && moduleName === './CalendarWidget') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'shims/CalendarWidget.tsx') };
  }
  if (context.originModulePath === imageContext) {
    throw new Error('The real image service must not enter the editor prototype bundle.');
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
