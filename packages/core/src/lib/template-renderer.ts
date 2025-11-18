/**
 * @file src/lib/template-renderer.ts
 * @description Simple template renderer for HTML reports
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Load template from templates directory
 */
export const loadTemplate = (templateName: string): string => {
  const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
  return fs.readFileSync(templatePath, 'utf8');
};

/**
 * Render template with variables
 */
export const render = (templateName: string, variables: Record<string, string>): string => {
  let result = loadTemplate(templateName);
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }

  return result;
};
