export const THEMES = Object.freeze({
  light: Object.freeze({ background: 0xd1d5db }),
  dark: Object.freeze({ background: 0x0d1117 }),
});

export function themeOutputs(output, theme = 'both') {
  if (!['light', 'dark', 'both'].includes(theme)) throw new Error('Theme must be light, dark, or both.');
  if (typeof output !== 'string' || !/\.gif$/i.test(output)) throw new Error('GIF output must end in .gif.');
  return theme === 'both'
    ? [{ theme: 'light', output }, { theme: 'dark', output: `${output.slice(0, -4)}-dark.gif` }]
    : [{ theme, output }];
}
